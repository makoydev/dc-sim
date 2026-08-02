import * as THREE from 'three';
import { Screen } from './screen.js';
import { HALL, inTapeLibrary, rig, setEmergencyReserve } from './world.js';
import {
  AISLES,
  ITEMS,
  createHandoverTask,
  createRoutineTasks,
  createSabotageTask,
  rollIncident,
} from './tasks.js';

// The day shift is the on-ramp: long enough to meet every system once, short
// enough that nobody is doing paperwork at the end.
const SHIFT_SECONDS = 600; // 08:00 -> 20:00
// nights run shorter: dread does not survive thirteen minutes, and the back
// half was where it turned into chores
const NIGHT_SECONDS = 540;
const SHIFT_START_HOUR = 8;
const NIGHT_START_HOUR = 22; // 22:00 -> 10:00, though nobody stays that long
const SHIFT_HOURS = 12;
const INCIDENT_GAP = [55, 105];
// The emergency lighting runs off the UPS bank, so the night has a light
// budget — HORROR.md §5. An untested bank is down to its last fitting around
// two thirds in; testing all three cabinets keeps four of six burning to the
// end. The per-test step is deliberately large: the difference between
// engaging with this at all and ignoring it should be most of the effect,
// and the first shed lands early enough that there is still time to go and act
// on it.
const LIGHT_RESERVE_BASE = 0.72;
const LIGHT_RESERVE_PER_TEST = 0.37;
// The thermal map is the only camera in the building — HORROR.md §4 and §11.
// Sampled coarsely on purpose: this is a facility trend log, not a security
// feed, and a sparse track reads far more like "something was here" than a
// smooth line would. The loop covers most of a night at 1.6 s a frame.
const TRACK_INTERVAL = 1.6;
const TRACK_SECONDS = 240;
const REVIEW_SECONDS = 11;

export class Game {
  constructor({
    scene, camera, player, racks, stations, hud, audio, presence, entity, partner, torch,
  }) {
    this.torch = torch ?? null;
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.racks = racks;
    this.stations = stations;
    this.hud = hud;
    this.audio = audio;
    this.presence = presence;
    this.entity = entity;
    this.partner = partner;
    this.mode = 'day';
    this.noise = 0;
    this.entityGraceUntil = 0;
    this.hidden = null;
    this.hideCooldown = 0;

    if (entity) {
      entity.onCatch = () => this.playerCaught();
      entity.onSabotage = (from) => this.entitySabotage(from);
      entity.isPlayerHidden = () => Boolean(this.hidden);
    }

    this.byKind = (kind) => this.stations.filter((s) => s.kind === kind);
    this.noc = stations.find((s) => s.kind === 'noc');
    this.spares = stations.find((s) => s.kind === 'spares');
    this.ewaste = stations.find((s) => s.kind === 'ewaste');

    this.phase = 'briefing';
    this.time = 0;
    this.uptime = 100;
    this.carrying = null;
    this.caffeine = 0;
    this.hallTemp = 21.5;
    this.tasks = [];
    this.stats = { resolved: 0, missed: 0, hotMinutes: 0, caught: 0 };
    this.nextIncidentAt = 30;
    this.handoverAdded = false;
    this.lightReserve = 1;
    this._shedCount = 0;
    this.track = [];
    this.review = null;
    this._trackAcc = 0;
    this._screenAcc = 0;
    this._humLevel = 1;
    this._look = new THREE.Vector3();
    this._toScreen = new THREE.Vector3();

    // each rack is cooled by whichever CRAC sits closest along the hall
    for (const rack of this.racks) {
      rack.crac = this.byKind('crac').reduce((best, c) =>
        Math.abs(c.position.z - rack.group.position.z) <
        Math.abs(best.position.z - rack.group.position.z)
          ? c
          : best,
      );
    }
  }

  // ---- lifecycle -----------------------------------------------------------

  start(mode = 'day') {
    this.mode = mode;
    this.phase = 'running';
    this.time = 0;
    this.tasks = createRoutineTasks(this.stations, mode);
    this.nextIncidentAt = 30;
    this.lightReserve = 1;
    this._shedCount = 0;
    this.track = [];
    this.review = null;
    this._trackAcc = 0;
    this._setArchiveDoor(mode === 'night');
    this.hud.setCompact(mode === 'night');
    this.partner?.reset();
    this.hud.say(
      mode === 'night'
        ? 'Nights. Ramos took the genset walk. Work the list.'
        : 'Shift started. Badge in, coffee, then rounds.',
      mode === 'night' ? 'warn' : 'good',
    );
    this.audio?.startAmbience();
  }

  /** Length of the shift currently being worked. */
  get duration() {
    return this.mode === 'night' ? NIGHT_SECONDS : SHIFT_SECONDS;
  }

  /** Shift time as a wall clock. Takes a time so the camera loop can label frames. */
  clockAt(time) {
    const start = this.mode === 'night' ? NIGHT_START_HOUR : SHIFT_START_HOUR;
    const hours = start + (time / this.duration) * SHIFT_HOURS;
    const h = Math.floor(hours) % 24;
    const m = Math.floor((hours - Math.floor(hours)) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  get clockText() {
    return this.clockAt(this.time);
  }

  get progress() {
    return this.time / this.duration;
  }

  get openTasks() {
    return this.tasks.filter((t) => t.state === 'todo');
  }

  update(dt) {
    if (this.phase !== 'running') return;

    this.time += dt;
    this.caffeine = Math.max(0, this.caffeine - dt);
    this.player.speedScale = this.caffeine > 0 ? 1.15 : 1;

    this._updateIncidents();
    this._updateWalkthrough();
    this._updateThermals(dt);
    this._updateDeadlines();
    this._updateUptime(dt);
    this._updateScreens(dt);
    this._updateHum();
    if (this.mode === 'night') {
      // the reserve rewrites every fitting's intensity, so it has to settle
      // before the director's flickers and blackouts paint over the top —
      // otherwise a flicker gets stamped out again the same frame
      this._updateEmergencyPower();
      this._recordTrack(dt);
      this._updateReview(dt);
      this.partner?.update(this.progress);
      this.presence?.update(dt, this.progress);
      this._updateEntity(dt);
    }
    this._refreshHud();

    if (this.time >= this.duration) this.endShift('clock');
  }

  // ---- world simulation ----------------------------------------------------

  _updateIncidents() {
    if (this.time < this.nextIncidentAt || this.time > this.duration - 90) return;
    const incident = rollIncident(this, this.time);
    this.nextIncidentAt =
      this.time + INCIDENT_GAP[0] + Math.random() * (INCIDENT_GAP[1] - INCIDENT_GAP[0]);
    if (!incident) return;
    this.tasks.push(incident);
    this.hud.say(
      `${incident.severity === 'critical' ? 'P1' : 'P2'} ticket: ${incident.title}`,
      incident.severity === 'critical' ? 'bad' : 'warn',
    );
    this.audio?.pager(incident.severity === 'critical');
  }

  _updateWalkthrough() {
    const walk = this.tasks.find((t) => t.kind === 'walk' && t.state === 'todo');
    if (!walk) return;
    const waypoints = walk.waypoints ?? AISLES;
    for (const aisle of waypoints) {
      if (walk.visited.has(aisle.name)) continue;
      if (this.player.position.distanceTo(aisle.pos) > 2.6) continue;
      walk.visited.add(aisle.name);
      walk.remaining = waypoints.length - walk.visited.size;
      this.audio?.blip();
      if (walk.remaining === 0) {
        this._completeTask(walk, `Walkthrough done — ${waypoints.length} aisles clear`);
      } else {
        this.hud.say(`Inspected ${aisle.name} (${walk.visited.size}/${waypoints.length})`);
      }
    }
  }

  _updateThermals(dt) {
    let sum = 0;
    let hot = 0;
    for (const rack of this.racks) {
      const crac = rack.crac;
      const cooling = !crac.running ? 0 : crac.filterClogged ? 0.45 : 1;
      const faultHeat = rack.fault?.type === 'drive' ? 1.5 : 0;
      const target = 19 + rack.load * 4 + (1 - cooling) * 22 + faultHeat;
      rack.temp += (target - rack.temp) * Math.min(1, dt * 0.09);
      sum += rack.temp;
      if (rack.temp > 32) hot++;
    }
    this.hallTemp = sum / this.racks.length;
    this.hotRacks = hot;
    if (hot > 0) this.stats.hotMinutes += dt / 60;
  }

  // ---- night shift ---------------------------------------------------------

  _updateEntity(dt) {
    if (!this.entity) return;
    if (this.time < this.entityGraceUntil) return; // it lets you get up
    if (this.entity.state === 'dormant' && this.progress > 0.075) {
      this.entity.spawn();
      this.hud.say('Somewhere down the hall, a door you did not open.', 'bad');
    }
    this.entity.update(dt);
    this.noise = Math.max(0, this.noise - dt * 1.6);

    // breathing. quiet, but it means standing still is not the same as being
    // absent — close enough and it finds you anyway
    this.breathAcc = (this.breathAcc ?? 0) + dt;
    if (this.breathAcc > 1.3) {
      this.breathAcc = 0;
      this.emitNoise(this.player.sprinting ? 0.22 : 0.1);
    }
  }

  /**
   * How much of a noise actually carries. A full fan wall swallows most of it;
   * a hall with the cooling down carries nearly all of it. This is the whole
   * reason a CRAC failure is frightening rather than just hot.
   */
  get masking() {
    // Nothing in the archive is cooled, so nothing in the archive is covering
    // you. Every step you take in there carries almost in full — it is the same
    // rule as a tripped CRAC, applied to a whole room.
    if (inTapeLibrary(this.player.position)) return 0.08;
    return 0.25 + this._humLevel * 0.55;
  }

  /** Anything the player does that makes a sound. */
  emitNoise(loudness, position = this.player.position) {
    if (this.mode !== 'night' || this.phase !== 'running') return;
    if (this.hidden && position === this.player.position) return; // you are still
    const carried = loudness * (1 - this.masking);
    this.noise = Math.min(1, Math.max(this.noise, carried * 1.6));
    this.entity?.hear(carried, position.clone());
  }

  /** It reaches up and turns the cooling off, because quiet suits it. */
  entitySabotage(from) {
    const crac = this.byKind('crac')
      .filter((c) => c.running)
      .sort((a, b) => a.position.distanceTo(from) - b.position.distanceTo(from))[0];
    if (!crac) return;
    crac.running = false;
    this.tasks.push(
      createSabotageTask(crac, this.time + 200),
    );
    this.hud.say(`${crac.label} just stopped. Nobody touched the panel.`, 'bad');
    this.audio?.stinger();
  }

  // ---- hiding --------------------------------------------------------------

  _hideAction(station) {
    if (this.hidden) return null;
    if (this.mode !== 'night') {
      return { label: station.label, hint: 'Nothing worth hiding from today', disabled: true };
    }
    if (this.time < this.hideCooldown) {
      return { label: station.label, hint: 'Not yet', disabled: true };
    }
    return {
      label: `Hide ${station.hide.under ? 'under' : 'inside'} the ${station.label.toLowerCase()}`,
      hint: 'E again to come out',
      holdTime: 0.6,
      run: () => this.enterHiding(station),
    };
  }

  enterHiding(station) {
    if (this.hidden) return;
    const { camera, yaw, arc } = station.hide;
    this.hidden = station;
    this.stashedY = this.player.position.y;
    this.player.frozen = true;
    this.player.position.copy(camera);
    this.player.yaw = yaw;
    this.player.pitch = 0;
    this.player.lookArc = { center: yaw, range: arc };
    this.audio?.setMuffled(true);
    this.hud.say(
      station.hide.under
        ? 'You get under it. Your own breathing is very loud.'
        : 'You pull the door to. Your own breathing is very loud.',
      'warn',
    );
    // the door, the scrape of your boots: hiding late is not free
    this.emitNoise(0.34, station.position);
  }

  exitHiding() {
    if (!this.hidden) return;
    const station = this.hidden;
    this.hidden = null;
    this.hideCooldown = this.time + 1.2;
    this.player.frozen = false;
    this.player.lookArc = null;
    this.player.position.copy(station.hide.exit);
    this.player.position.y = this.stashedY ?? 1.68;
    this.audio?.setMuffled(false);
    this.emitNoise(0.34, station.position);
  }

  /** §6: you lose an hour, not the session. */
  playerCaught() {
    if (this.phase !== 'running') return;
    this.phase = 'caught';
    this.stats.caught++;
    this.audio?.stinger();
    this.entity?.despawn();

    // losing an hour must never wind the clock back, whatever the shift length
    this.time = Math.max(this.time, Math.min(this.duration - 1, this.time + this.duration / 12));
    this.uptime = Math.max(90, this.uptime - 0.4);
    for (const rack of this.racks) rack.temp += 2.5;
    this.carrying = null;
    // an hour passes; whatever was on the monitor finished playing without you.
    // Leaving it running would also wedge the desk shut, handover and all.
    this.review = null;
    this.entityGraceUntil = this.time + 75;
    this.exitHiding();
  }

  /** Called once the come-to overlay has played out. */
  resumeAfterCatch() {
    if (this.phase !== 'caught') return;
    this.phase = 'running';
    this.player.position.set(0, this.player.position.y, -10);
    this.player.velocity.set(0, 0, 0);
    this.noise = 0;
    this.hud.say('You come to by the door. An hour gone. The hall is warmer.', 'warn');
  }

  /**
   * The emergency rig is on the UPS bank, so the light in the hall drains. The
   * only way to slow it is to have self-tested a cabinet — routine maintenance
   * that nobody asks you for and that costs you noise in a fixed corner of the
   * floor. Doing the boring job early is what buys the back half of the shift.
   */
  _updateEmergencyPower() {
    const tested = this.byKind('ups').filter((u) => u.selfTested).length;
    const capacity = this.duration * (LIGHT_RESERVE_BASE + LIGHT_RESERVE_PER_TEST * tested);
    this.lightReserve = THREE.MathUtils.clamp(1 - this.time / capacity, 0, 1);

    const shed = setEmergencyReserve(this.lightReserve);
    if (shed === this._shedCount) return;

    const lit = rig.emergency.length - shed;
    if (shed > this._shedCount) {
      if (this._shedCount === 0) this.audio?.alarm();
      this.hud.say(
        // the archive goes first, and knowing that is worth its own line: if
        // you were going to go for a cell, you are now going in the dark
        this._shedCount === 0 ? 'The archive light drops. Nothing back there now.'
          : lit > 1 ? `Another fitting drops off the bank. ${lit} lights left.`
            : 'One light left, over the door.',
        'bad',
      );
    } else {
      this.hud.say('The bank picks the load back up. The lights lift.', 'good');
    }
    this._shedCount = shed;
  }

  /**
   * The thermal map has been logging the hall all night whether anyone was
   * watching or not. Both tracks go in: the point of the loop is not where it
   * is now, it is how near it came while you had your back to it.
   */
  _recordTrack(dt) {
    this._trackAcc += dt;
    if (this._trackAcc < TRACK_INTERVAL) return;
    this._trackAcc = 0;

    const onFloor = this.entity && this.entity.state !== 'dormant';
    this.track.push({
      t: this.time,
      px: this.player.position.x,
      pz: this.player.position.z,
      ex: onFloor ? this.entity.position.x : null,
      ez: onFloor ? this.entity.position.z : null,
    });
    const cap = Math.round(TRACK_SECONDS / TRACK_INTERVAL);
    if (this.track.length > cap) this.track.splice(0, this.track.length - cap);
  }

  /** How near it got, over a stretch of the loop. Null if it never showed. */
  closestApproach(frames) {
    let best = null;
    for (const f of frames) {
      if (f.ex === null) continue;
      const d = Math.hypot(f.ex - f.px, f.ez - f.pz);
      if (!best || d < best.distance) best = { distance: d, t: f.t };
    }
    return best;
  }

  _updateReview(dt) {
    if (!this.review) return;
    this.review.elapsed += dt;
    if (this.review.elapsed < REVIEW_SECONDS) return;

    // the number is the whole payoff: you already survived this, and now you
    // know by how much
    const near = this.closestApproach(this.review.frames);
    this.review = null;
    this.hud.say(
      near
        ? `Loop ends. Nearest it came to you: ${near.distance.toFixed(1)} m.`
        : 'Loop ends. Nothing on it but you.',
      near && near.distance < 6 ? 'bad' : 'warn',
    );
  }

  /**
   * The fan wall is the hall's voice. When cooling drops the hum drops with
   * it — on nights, that silence is the loudest thing in the game.
   */
  _updateHum() {
    const cracs = this.byKind('crac');
    const running = cracs.filter((c) => c.running && !c.filterClogged).length;
    const level = cracs.length ? running / cracs.length : 1;
    if (level !== this._humLevel) {
      this._humLevel = level;
      this.audio?.setHum(level);
      if (this.mode === 'night' && level < 1) {
        this.hud.say('The fans wind down. You can hear the room now.', 'warn');
      }
    }
  }

  _updateDeadlines() {
    for (const t of this.tasks) {
      if (t.state !== 'todo' || t.dueAt == null) continue;
      if (this.time < t.dueAt) continue;
      t.state = 'failed';
      this.stats.missed++;
      this.uptime -= t.severity === 'critical' ? 0.9 : 0.35;
      this.hud.say(`SLA breach: ${t.title}`, 'bad');
      this.audio?.alarm();
      this._autoResolve(t);
    }
  }

  /** A missed ticket still gets fixed by someone else, at a cost. */
  _autoResolve(t) {
    if (t.rack) t.rack.fault = null;
    if (t.crac) {
      t.crac.running = true;
      t.crac.filterClogged = false;
      t.crac.filterHours = 0;
    }
    if (t.pdu) t.pdu.breakerTripped = false;
    if (t.ups) t.ups.onBattery = false;
  }

  _updateUptime(dt) {
    const criticals = this.openTasks.filter((t) => t.severity === 'critical').length;
    const drain = criticals * 0.011 + (this.hotRacks ?? 0) * 0.0016;
    if (drain > 0) this.uptime = Math.max(90, this.uptime - drain * dt);

    if (!this.handoverAdded && this.time > this.duration * 0.82) {
      this.handoverAdded = true;
      this.tasks.push(createHandoverTask(this.noc, this.mode));
      this.hud.say('End of shift approaching — file the handover at the NOC.', 'warn');
    }
  }

  // ---- interaction ---------------------------------------------------------

  resolveAction(target) {
    if (this.phase !== 'running') return null;
    return target.kind ? this._stationAction(target) : this._rackAction(target);
  }

  _taskFor(kind, match) {
    return this.tasks.find(
      (t) => t.state === 'todo' && t.kind === kind && (!match || match(t)),
    );
  }

  _rackAction(rack) {
    if (rack.fault?.type === 'drive') {
      const task = this._taskFor('drive-swap', (t) => t.rack === rack);
      if (this.carrying?.key !== 'drive') {
        return {
          label: `Rack ${rack.id}: failed drive`,
          hint: 'Fetch a spare drive from the cage first',
          disabled: true,
        };
      }
      return {
        label: `Swap drive in rack ${rack.id}`,
        hint: 'Hold E',
        holdTime: 3.0,
        run: () => {
          rack.fault = null;
          this.audio?.success();
          // days log the dead drive properly; nights have bigger problems
          if (this.mode === 'night') {
            this.carrying = null;
            if (task) this._completeTask(task, `${rack.id} is back. Drive swapped.`);
          } else {
            this.carrying = ITEMS.deadDrive;
            if (task) {
              task.need = null;
              task.stage = 'dispose';
              task.title = `Dispose failed drive from ${rack.id}`;
              task.hint = 'E-waste bin, south-west corner';
            }
            this.hud.say(`New drive online in ${rack.id}. Array rebuilding.`, 'good');
          }
        },
      };
    }

    if (rack.fault?.type === 'cable') {
      const task = this._taskFor('cable-fix', (t) => t.rack === rack);
      if (this.carrying?.key !== 'cable') {
        return {
          label: `Rack ${rack.id}: uplink flapping`,
          hint: 'Fetch an LC patch cable from the cage',
          disabled: true,
        };
      }
      return {
        label: `Reseat uplink on rack ${rack.id}`,
        hint: 'Hold E',
        holdTime: 2.4,
        run: () => {
          rack.fault = null;
          this.carrying = null;
          this.audio?.success();
          if (task) this._completeTask(task, `${rack.id} uplink stable — errors cleared`);
        },
      };
    }

    return {
      label: `Read rack ${rack.id}`,
      hint: `${rack.temp.toFixed(1)}°C · ${Math.round(rack.load * 100)}% load`,
      holdTime: 0.5,
      run: () => {
        this.audio?.blip();
        this.hud.say(
          `${rack.id}: inlet ${rack.temp.toFixed(1)}°C, ${Math.round(rack.load * 100)}% load, no alarms.`,
        );
      },
    };
  }

  _stationAction(station) {
    switch (station.kind) {
      case 'spares':
        return this._sparesAction();
      case 'ewaste':
        return this._ewasteAction();
      case 'crac':
        return this._cracAction(station);
      case 'ups':
        return this._upsAction(station);
      case 'pdu':
        return this._pduAction(station);
      case 'fire':
        return this._fireAction(station);
      case 'coffee':
        return this._coffeeAction(station);
      case 'cells':
        return this._cellsAction(station);
      case 'tapedoor':
        return this._tapeDoorAction(station);
      case 'noc':
        return this._nocAction(station);
      case 'hide':
        return this._hideAction(station);
      default:
        return null;
    }
  }

  _sparesAction() {
    if (this.carrying?.key === 'deadDrive') {
      return {
        label: 'Hands full',
        hint: 'Dump the failed drive in the e-waste bin first',
        disabled: true,
      };
    }
    const wanted = this.openTasks.find((t) => t.need);
    if (!wanted) {
      return { label: 'Spares cage', hint: 'Nothing on the pick list', disabled: true };
    }
    const item = ITEMS[wanted.need];
    if (this.carrying?.key === item.key) {
      return { label: `Already carrying ${item.label}`, disabled: true };
    }
    return {
      label: `Take ${item.label}`,
      hint: wanted.title,
      holdTime: 0.7,
      run: () => {
        this.carrying = item;
        this.audio?.blip();
        this.hud.say(`Signed out: ${item.label}`);
      },
    };
  }

  _ewasteAction() {
    if (this.carrying?.key !== 'deadDrive') {
      return { label: 'E-waste bin', hint: 'Nothing to dispose', disabled: true };
    }
    return {
      label: 'Dispose failed drive',
      holdTime: 1.0,
      run: () => {
        this.carrying = null;
        this.audio?.success();
        const task = this._taskFor('drive-swap', (t) => t.stage === 'dispose');
        if (task) this._completeTask(task, 'Failed drive logged and binned.');
      },
    };
  }

  _cracAction(crac) {
    if (!crac.running) {
      const task = this._taskFor('crac-restart', (t) => t.crac === crac);
      return {
        label: `Restart ${crac.label}`,
        hint: 'Hold E — clear fault, spin up fans',
        holdTime: 2.6,
        run: () => {
          crac.running = true;
          this.audio?.success();
          if (task) this._completeTask(task, `${crac.label} back online. Zone cooling restored.`);
        },
      };
    }
    if (crac.filterClogged) {
      const task = this._taskFor('filter-swap', (t) => t.crac === crac);
      if (this.carrying?.key !== 'filter') {
        return {
          label: `${crac.label}: filter blocked`,
          hint: 'Collect a filter from the spares cage',
          disabled: true,
        };
      }
      return {
        label: `Replace filter on ${crac.label}`,
        holdTime: 3.2,
        run: () => {
          crac.filterClogged = false;
          crac.filterHours = 0;
          this.carrying = null;
          this.audio?.success();
          if (task) this._completeTask(task, `${crac.label} filter changed. Airflow normal.`);
        },
      };
    }
    const log = this._taskFor('crac-log');
    if (log && !log.visited.has(crac.id)) {
      return {
        label: `Log temps — ${crac.label}`,
        hint: `Supply ${crac.supply.toFixed(1)}°C · Return ${crac.ret.toFixed(1)}°C`,
        holdTime: 1.2,
        run: () => {
          log.visited.add(crac.id);
          log.remaining = log.total - log.visited.size;
          this.audio?.blip();
          if (log.remaining === 0) this._completeTask(log, 'All CRAC readings logged.');
          else this.hud.say(`${crac.label} logged (${log.visited.size}/${log.total}).`);
        },
      };
    }
    return {
      label: crac.label,
      hint: `Supply ${crac.supply.toFixed(1)}°C · Return ${crac.ret.toFixed(1)}°C · filter ${crac.filterHours}h`,
      disabled: true,
    };
  }

  _upsAction(ups) {
    if (ups.onBattery) {
      const task = this._taskFor('ups-transfer', (t) => t.ups === ups);
      return {
        label: `Transfer ${ups.label} to mains`,
        hint: `Battery ${Math.round(ups.charge * 100)}%`,
        holdTime: 2.4,
        run: () => {
          ups.onBattery = false;
          this.audio?.success();
          if (task) this._completeTask(task, `${ups.label} back on utility power.`);
        },
      };
    }
    const test = this._taskFor('ups-test');
    if (test && !test.visited.has(ups.id)) {
      return {
        label: `Self-test ${ups.label}`,
        holdTime: 2.2,
        run: () => {
          test.visited.add(ups.id);
          test.remaining = test.total - test.visited.size;
          ups.selfTested = true;
          this.audio?.blip();
          if (test.remaining === 0) this._completeTask(test, 'UPS bank self-tests passed.');
          else this.hud.say(`${ups.label} passed (${test.visited.size}/${test.total}).`);
        },
      };
    }
    // Nights never put this on the checklist and nobody asks for it, but a
    // cabinet that passes a test carries the emergency lighting further into
    // the shift. The hint has to state the payoff outright: there is no coach
    // at night, so this prompt is the only place the trade is ever explained.
    if (this.mode === 'night' && !ups.selfTested) {
      return {
        label: `Run a battery test — ${ups.label}`,
        hint: `${Math.round(ups.charge * 100)}% · keeps the lights on longer`,
        holdTime: 2.6,
        run: () => {
          ups.selfTested = true;
          this.audio?.success();
          this.hud.say(`${ups.label} takes the load. That is more light later.`, 'good');
        },
      };
    }

    return {
      label: ups.label,
      hint: this.mode === 'night' && ups.selfTested
        ? `${Math.round(ups.charge * 100)}% · carrying the lights`
        : `Battery ${Math.round(ups.charge * 100)}% · load ${Math.round(ups.load * 100)}%`,
      disabled: true,
    };
  }

  _pduAction(pdu) {
    if (!pdu.breakerTripped) {
      return { label: pdu.label, hint: `${pdu.loadKw.toFixed(1)} kW on this feed`, disabled: true };
    }
    const task = this._taskFor('breaker-reset', (t) => t.pdu === pdu);
    return {
      label: `Reset breaker — ${pdu.label}`,
      hint: 'Hold E',
      holdTime: 2.0,
      run: () => {
        pdu.breakerTripped = false;
        this.audio?.success();
        if (task) this._completeTask(task, `${pdu.label} feed restored. Redundancy back.`);
      },
    };
  }

  _fireAction(panel) {
    const task = this._taskFor('fire-check');
    if (!task) {
      return { label: 'VESDA panel', hint: panel.alarm ? 'ALARM' : 'All zones normal', disabled: true };
    }
    return {
      label: 'Verify VESDA panel',
      holdTime: 1.5,
      run: () => {
        this.audio?.blip();
        this._completeTask(task, 'Fire panel checked — all zones normal.');
      },
    };
  }

  _coffeeAction() {
    if (this.carrying?.key === 'deadDrive') {
      return { label: 'Coffee machine', hint: 'Not with that in your hands', disabled: true };
    }
    return {
      label: 'Pour a coffee',
      hint: this.caffeine > 0 ? 'Already wired' : 'Restores stamina, +15% pace',
      holdTime: 1.4,
      run: () => {
        this.caffeine = 90;
        this.player.stamina = 1;
        this.audio?.blip();
        const task = this._taskFor('coffee');
        if (task) this._completeTask(task, 'Coffee acquired. Ready for rounds.');
        else this.hud.say('Coffee acquired.', 'good');
      },
    };
  }

  /**
   * Why the archive exists. The torch is the only reliable light once the bank
   * starts shedding zones, and its spare cells live in the one room where
   * nothing covers the noise you make getting to them.
   */
  _cellsAction(station) {
    if (this.mode !== 'night') {
      return { label: station.label, hint: 'For the night torch. Not your problem today.', disabled: true };
    }
    if (station.remaining <= 0) {
      return { label: station.label, hint: 'Shelf is empty', disabled: true };
    }
    if (this.torch && this.torch.battery > 0.85) {
      return { label: station.label, hint: 'The cell in your torch is still good', disabled: true };
    }
    return {
      label: 'Take a fresh cell',
      hint: `${station.remaining} left on the shelf`,
      holdTime: 2.2,
      run: () => {
        station.remaining--;
        const spent = station.cells[station.remaining];
        spent?.parent?.remove(spent);
        if (this.torch) this.torch.battery = 1;
        this.audio?.success();
        this.hud.say('Fresh cell in the torch.', 'good');
      },
    };
  }

  _tapeDoorAction(door) {
    return {
      label: door.label,
      hint: this.mode === 'night'
        ? 'Standing open. It was not you who opened it.'
        : 'Badged shut. Nobody goes in there on days.',
      disabled: true,
    };
  }

  /** Shut and badged by day; already open by the time you come on at night. */
  _setArchiveDoor(open) {
    const door = this.stations.find((s) => s.kind === 'tapedoor');
    if (!door) return;
    door.blocker.open = open;
    if (door.group) door.group.rotation.y = open ? -Math.PI / 2.2 : 0;
  }

  _nocAction() {
    const handover = this._taskFor('handover');
    if (handover) {
      return {
        label: 'File shift handover',
        hint: 'Ends the shift',
        holdTime: 3.0,
        run: () => {
          this._completeTask(handover, 'Handover filed.');
          this.endShift('handover');
        },
      };
    }
    // Nights: the thermal map is the only camera in the building, and this desk
    // is the only place it can be read — which is the trade. Everything you
    // need to do is at the other end of the hall, and the loop takes eleven
    // seconds you have to spend standing still in the corner to watch.
    if (this.mode === 'night' && this.entity) {
      if (this.review) {
        const left = Math.ceil(REVIEW_SECONDS - this.review.elapsed);
        return { label: 'Camera loop', hint: `Playing back · ${left}s`, disabled: true };
      }
      if (!this.track.some((f) => f.ex !== null)) {
        return { label: 'Camera loop', hint: 'Nothing on it but you so far', disabled: true };
      }
      return {
        label: 'Play back the camera loop',
        hint: 'The last few minutes of this floor',
        holdTime: 1.8,
        run: () => {
          this.review = { elapsed: 0, frames: this.track.slice() };
          this.audio?.blip();
          this.hud.say('The map winds back.', 'warn');
        },
      };
    }

    const open = this.openTasks.length;
    return {
      label: 'NOC dashboard',
      hint: `${open} open item${open === 1 ? '' : 's'} · uptime ${this.uptime.toFixed(2)}%`,
      disabled: true,
    };
  }

  _completeTask(task, message) {
    task.state = 'done';
    if (task.dueAt != null) this.stats.resolved++;
    if (message) this.hud.say(message, 'good');
    this.audio?.success();
  }

  // ---- presentation --------------------------------------------------------

  get trackedTask() {
    const order = { critical: 0, warning: 1, routine: 2 };
    return this.openTasks
      .filter((t) => !t.optional)
      .sort((a, b) => {
        const s = order[a.severity] - order[b.severity];
        if (s !== 0) return s;
        return (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity);
      })[0];
  }

  markerFor(task) {
    if (!task) return null;
    if (this.carrying?.key === 'deadDrive') {
      return { pos: this.ewaste.position, label: 'E-waste bin' };
    }
    if (task.need && this.carrying?.key !== task.need) {
      return { pos: this.spares.position, label: `Spares cage — ${ITEMS[task.need].label}` };
    }
    if (task.kind === 'walk') {
      const next = (task.waypoints ?? AISLES).find((a) => !task.visited.has(a.name));
      return next ? { pos: next.pos.clone().setY(1.6), label: next.name } : null;
    }
    const target = task.targets?.find((t) => {
      if (!task.visited) return true;
      return !task.visited.has(t.id);
    });
    if (!target) return null;
    const pos = target.frontSpot
      ? target.frontSpot.clone().setY(1.6)
      : target.position.clone();
    return { pos, label: target.label ?? target.id ?? task.title };
  }

  _refreshHud() {
    const routine = this.tasks.filter((t) => !t.optional);
    const done = routine.filter((t) => t.state === 'done').length;
    this.hud.setStatus({
      clock: this.clockText,
      uptime: this.uptime,
      temp: this.hallTemp,
      done,
      total: routine.length,
    });

    const tracked = this.trackedTask;
    this.hud.setChecklist(
      this.tasks.map((t) => ({
        id: t.id,
        title: t.title,
        state: t.state === 'todo' && t === tracked ? 'active' : t.state,
        progressText: this._progressText(t),
        dueText: this._dueText(t),
        dueClass: this._dueClass(t),
      })),
    );

    this.hud.setObjective(
      this.mode === 'night' && tracked
        ? {
            title: tracked.title,
            sub: this._progressText(tracked) || this._dueText(tracked),
            urgent: tracked.severity === 'critical',
          }
        : null,
    );

    this.hud.setAlerts(
      this.openTasks
        .filter((t) => t.severity === 'critical')
        .map((t) => ({ text: t.title, kind: 'bad' })),
    );

    this.hud.setCarry(this.carrying);
    this.hud.setStamina(this.player.stamina);

    const marker = this.markerFor(tracked);
    this.hud.setMarker(marker?.pos, this.camera, marker?.label ?? '');
  }

  _progressText(t) {
    if (t.total > 1 && t.state === 'todo') return `${t.total - t.remaining}/${t.total} done`;
    if (t.state === 'todo' && t.hint) return t.hint;
    return '';
  }

  _dueText(t) {
    if (t.state !== 'todo' || t.dueAt == null) return '';
    const left = Math.max(0, t.dueAt - this.time);
    return `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`;
  }

  _dueClass(t) {
    if (t.state !== 'todo' || t.dueAt == null) return 'dim';
    const left = t.dueAt - this.time;
    return left < 30 ? 'bad' : left < 75 ? 'warn' : 'dim';
  }

  /**
   * Repainting a canvas texture means a full re-upload, so only do it for
   * displays the player could actually be reading.
   */
  _screenWorthPainting(position) {
    const distance = position.distanceTo(this.player.position);
    if (distance > 14) return false;
    if (distance < 3) return true; // right on top of it, never mind facing
    this.camera.getWorldDirection(this._look);
    this._toScreen.copy(position).sub(this.player.position).normalize();
    return this._look.dot(this._toScreen) > 0.1;
  }

  _updateScreens(dt) {
    this._screenAcc += dt;
    if (this._screenAcc < 0.4) return;
    const step = this._screenAcc;
    this._screenAcc = 0;

    for (const crac of this.byKind('crac')) {
      const cooling = crac.running ? (crac.filterClogged ? 0.45 : 1) : 0;
      crac.supply += ((crac.running ? 16.5 + (1 - cooling) * 6 : 26) - crac.supply) * 0.15;
      crac.ret += ((this.hallTemp + 5.5) - crac.ret) * 0.12;
      crac.filterHours += step * 3;
      if (!this._screenWorthPainting(crac.position)) continue;
      crac.screen.paint((g, w, h) => {
        Screen.bg(g, w, h, crac.running ? '#06121a' : '#1c0a08');
        Screen.text(g, crac.label, 12, 30, 22, '#4cc2ff');
        Screen.text(g, crac.running ? 'RUN' : 'FAULT', w - 12, 30, 22,
          crac.running ? '#46d39a' : '#ff5f56', 'right');
        Screen.text(g, `SUP ${crac.supply.toFixed(1)}C`, 12, 62, 20);
        Screen.text(g, `RET ${crac.ret.toFixed(1)}C`, 12, 88, 20);
        Screen.bar(g, 12, 98, w - 24, 8, cooling, cooling > 0.8 ? '#46d39a' : '#ffc247');
        Screen.text(g, crac.filterClogged ? 'FILTER: BLOCKED' : `FILTER ${Math.round(crac.filterHours)}h`,
          12, h - 12, 16, crac.filterClogged ? '#ff5f56' : '#7d93a6');
      });
    }

    for (const ups of this.byKind('ups')) {
      // At night this bank is carrying the emergency lighting, so the number on
      // the cabinet stops being a trickle charge and becomes the countdown — it
      // is the only readout of the light budget anywhere in the hall.
      const carrying = this.mode === 'night' && !ups.onBattery;
      ups.charge = THREE.MathUtils.clamp(
        carrying
          ? ups.charge + (this.lightReserve - ups.charge) * 0.5
          : ups.charge + (ups.onBattery ? -step * 0.006 : step * 0.002),
        0, 1,
      );
      if (!this._screenWorthPainting(ups.position)) continue;
      const low = carrying && ups.charge < 0.35;
      ups.screen.paint((g, w, h) => {
        Screen.bg(g, w, h, ups.onBattery || low ? '#1c1406' : '#06121a');
        Screen.text(g, ups.label, 12, 28, 20, '#4cc2ff');
        Screen.text(g, ups.onBattery ? 'ON BATTERY' : carrying ? 'CARRYING LIGHTING' : 'ON MAINS',
          12, 54, 18, ups.onBattery || low ? '#ffc247' : '#46d39a');
        Screen.text(g, `LOAD ${Math.round(ups.load * 100)}%`, 12, 78, 16, '#d8e6f2');
        Screen.bar(g, 12, 86, w - 24, 8, ups.charge, low ? '#ff5f56' : '#46d39a');
        Screen.text(g, `BATT ${Math.round(ups.charge * 100)}%`, 12, h - 12, 15, '#7d93a6');
      });
    }

    const vesda = this.stations.find((s) => s.kind === 'fire');
    if (this._screenWorthPainting(vesda.position)) vesda.screen.paint((g, w, h) => {
      Screen.bg(g, w, h, '#12060a');
      Screen.text(g, 'VESDA', 12, 30, 20, '#ff8a8a');
      Screen.text(g, 'ALL ZONES NORMAL', 12, 56, 15, '#46d39a');
      Screen.text(g, `SMOKE 0.003%/m`, 12, h - 12, 14, '#7d93a6');
    });

    if (this._screenWorthPainting(this.noc.position)) this._paintNoc();
  }

  /**
   * The thermal map only covers the hall. Anything in the archive is simply off
   * the map — which is worth more than clamping it to the edge would be.
   */
  _onCamera(hx, hz) {
    return hx >= HALL.minX && hx <= HALL.maxX && hz >= HALL.minZ && hz <= HALL.maxZ;
  }

  /** Hall floor coordinates onto a rectangle of a screen. */
  _hallToMap(hx, hz, x, y, w, h) {
    return {
      x: x + ((hx - HALL.minX) / (HALL.maxX - HALL.minX)) * w,
      y: y + ((hz - HALL.minZ) / (HALL.maxZ - HALL.minZ)) * h,
    };
  }

  /**
   * Square layers rather than a gradient: it matches the blocky readout the
   * rest of these screens are drawn in, and it survives the stubbed canvas the
   * smoke test paints through.
   */
  _paintColdSpot(g, cx, cy) {
    for (const [size, alpha, color] of [
      [26, 0.12, '#0a2f4d'], [17, 0.22, '#0f4a72'], [9, 0.55, '#4cc2ff'], [4, 0.9, '#dff2ff'],
    ]) {
      g.globalAlpha = alpha;
      g.fillStyle = color;
      g.fillRect(cx - size / 2, cy - size / 2, size, size);
    }
    g.globalAlpha = 1;
  }

  /**
   * The loop, scrubbed through over REVIEW_SECONDS. A floor plan on the left at
   * the hall's real proportions, the numbers on the right — the one that
   * matters being how close it got while you were somewhere else.
   */
  _paintReview(g, w, h) {
    const { frames, elapsed } = this.review;
    const played = Math.min(1, elapsed / REVIEW_SECONDS);
    const shown = frames.slice(0, Math.max(1, Math.round(frames.length * played)));
    const head = shown[shown.length - 1];

    const map = { x: 12, y: 36, w: 104, h: 88 };
    const put = (hx, hz) => this._hallToMap(hx, hz, map.x, map.y, map.w, map.h);

    Screen.text(g, 'CAMERA LOOP', 12, 26, 18, '#ffc247');
    g.strokeStyle = 'rgba(76,194,255,0.3)';
    g.lineWidth = 2;
    g.strokeRect(map.x, map.y, map.w, map.h);

    // your track first, so its track always draws over the top of yours
    g.globalAlpha = 0.45;
    g.fillStyle = '#2f6b52';
    for (const f of shown) {
      if (!this._onCamera(f.px, f.pz)) continue;
      const p = put(f.px, f.pz);
      g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
    }
    g.globalAlpha = 0.5;
    g.fillStyle = '#4cc2ff';
    for (const f of shown) {
      if (f.ex === null || !this._onCamera(f.ex, f.ez)) continue;
      const p = put(f.ex, f.ez);
      g.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    g.globalAlpha = 1;

    // the two heads are independent: either of you can be off the map, and
    // being the one that is off it is not reassuring
    if (head && this._onCamera(head.px, head.pz)) {
      const you = put(head.px, head.pz);
      g.fillStyle = '#46d39a';
      g.fillRect(you.x - 2.5, you.y - 2.5, 5, 5);
    }
    if (head && head.ex !== null && this._onCamera(head.ex, head.ez)) {
      const it = put(head.ex, head.ez);
      this._paintColdSpot(g, it.x, it.y);
    }

    const near = this.closestApproach(shown);
    const col = 128;
    Screen.text(g, head ? this.clockAt(head.t) : '--:--', col, 52, 22, '#d8e6f2');
    Screen.text(g, 'NEAREST', col, 78, 14, '#7d93a6');
    Screen.text(g, near ? `${near.distance.toFixed(1)} m` : 'no contact', col, 100, 22,
      near && near.distance < 6 ? '#ff5f56' : '#46d39a');
    if (near) Screen.text(g, `at ${this.clockAt(near.t)}`, col, 118, 14, '#7d93a6');

    Screen.bar(g, 12, h - 22, w - 24, 5, played, '#ffc247');
    Screen.text(g, 'YOU', 12, h - 6, 13, '#46d39a');
    Screen.text(g, 'UNRESOLVED CONTACT', w - 12, h - 6, 13, '#4cc2ff', 'right');
  }

  _paintNoc() {
    const [left, center, right] = this.noc.monitors;
    const open = this.openTasks;

    left.paint((g, w, h) => {
      Screen.bg(g, w, h);
      if (this.review) {
        this._paintReview(g, w, h);
        return;
      }
      Screen.text(g, 'HALL THERMALS', 14, 30, 20, '#4cc2ff');
      const cols = 12;
      const rows = 6;
      const cw = (w - 28) / cols;
      const ch = 20;
      this.racks.forEach((rack, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols) % rows;
        const t = THREE.MathUtils.clamp((rack.temp - 20) / 18, 0, 1);
        g.fillStyle = `hsl(${(1 - t) * 150}, 70%, ${28 + t * 22}%)`;
        g.fillRect(14 + col * cw, 44 + row * ch, cw - 2, ch - 2);
      });
      // §4: the map is also the only camera. It reads as a cold spot because
      // whatever it is does not register as heat — visible from this desk and
      // nowhere else in the hall.
      const it = this.entity;
      if (this.mode === 'night' && it && it.state !== 'dormant'
          && this._onCamera(it.position.x, it.position.z)) {
        const at = this._hallToMap(it.position.x, it.position.z, 14, 44, w - 28, 106);
        this._paintColdSpot(g, at.x, at.y);
      }
      Screen.text(g, `AVG ${this.hallTemp.toFixed(1)}C`, 14, h - 14, 17, '#d8e6f2');
      Screen.text(g, `HOT ${this.hotRacks ?? 0}`, w - 14, h - 14, 17,
        this.hotRacks ? '#ff5f56' : '#46d39a', 'right');
    });

    center.paint((g, w, h) => {
      Screen.bg(g, w, h);
      Screen.text(g, 'OPEN TICKETS', 14, 30, 20, '#4cc2ff');
      if (!open.length) Screen.text(g, 'queue clear', 14, 62, 17, '#46d39a');
      open.slice(0, 6).forEach((t, i) => {
        const color = t.severity === 'critical' ? '#ff5f56' : t.severity === 'warning' ? '#ffc247' : '#7d93a6';
        Screen.text(g, `• ${t.title}`.slice(0, 34), 14, 60 + i * 26, 15, color);
      });
      Screen.text(g, this.clockText, w - 14, h - 14, 18, '#d8e6f2', 'right');
    });

    right.paint((g, w, h) => {
      Screen.bg(g, w, h);
      Screen.text(g, 'SLA', 14, 30, 20, '#4cc2ff');
      Screen.text(g, `${this.uptime.toFixed(3)}%`, 14, 76, 38,
        this.uptime > 99.9 ? '#46d39a' : this.uptime > 99.5 ? '#ffc247' : '#ff5f56');
      Screen.bar(g, 14, 92, w - 28, 10, (this.uptime - 99) / 1, '#4cc2ff');
      Screen.text(g, `RESOLVED ${this.stats.resolved}`, 14, h - 40, 16, '#7d93a6');
      Screen.text(g, `BREACHED ${this.stats.missed}`, 14, h - 16, 16,
        this.stats.missed ? '#ff5f56' : '#7d93a6');
    });
  }

  // ---- scoring -------------------------------------------------------------

  endShift(reason) {
    if (this.phase !== 'running') return;
    this.phase = 'report';
    this.audio?.stopAmbience();

    const routine = this.tasks.filter((t) => !t.optional);
    const done = routine.filter((t) => t.state === 'done').length;
    const taskScore = routine.length ? (done / routine.length) * 60 : 60;
    const uptimeScore = THREE.MathUtils.clamp((this.uptime - 98.5) / 1.5, 0, 1) * 40;
    const score = Math.round(taskScore + uptimeScore);
    const grade =
      score >= 95 ? 'S' : score >= 85 ? 'A' : score >= 72 ? 'B' : score >= 58 ? 'C' : 'D';

    this.report = {
      reason,
      score,
      grade,
      done,
      total: routine.length,
      uptime: this.uptime,
      resolved: this.stats.resolved,
      missed: this.stats.missed,
      caught: this.stats.caught,
      mode: this.mode,
      partnerLost: Boolean(this.partner?.lost),
      clock: this.clockText,
    };
    return this.report;
  }
}
