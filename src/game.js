import * as THREE from 'three';
import { Screen } from './screen.js';
import {
  AISLES,
  ITEMS,
  createHandoverTask,
  createRoutineTasks,
  createSabotageTask,
  rollIncident,
} from './tasks.js';

const SHIFT_SECONDS = 780; // 08:00 -> 20:00
const SHIFT_START_HOUR = 8;
const NIGHT_START_HOUR = 22; // 22:00 -> 10:00, though nobody stays that long
const SHIFT_HOURS = 12;
const INCIDENT_GAP = [55, 105];

export class Game {
  constructor({ scene, camera, player, racks, stations, hud, audio, presence, entity }) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.racks = racks;
    this.stations = stations;
    this.hud = hud;
    this.audio = audio;
    this.presence = presence;
    this.entity = entity;
    this.mode = 'day';
    this.noise = 0;
    this.entityGraceUntil = 0;

    if (entity) {
      entity.onCatch = () => this.playerCaught();
      entity.onSabotage = (from) => this.entitySabotage(from);
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
    this._screenAcc = 0;
    this._humLevel = 1;

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
    this.tasks = createRoutineTasks(this.stations);
    this.nextIncidentAt = 30;
    this.hud.say(
      mode === 'night'
        ? 'Nights. Ramos took the genset walk. Work the list.'
        : 'Shift started. Badge in, coffee, then rounds.',
      mode === 'night' ? 'warn' : 'good',
    );
    this.audio?.startAmbience();
  }

  get clockText() {
    const start = this.mode === 'night' ? NIGHT_START_HOUR : SHIFT_START_HOUR;
    const hours = start + (this.time / SHIFT_SECONDS) * SHIFT_HOURS;
    const h = Math.floor(hours) % 24;
    const m = Math.floor((hours - Math.floor(hours)) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  get progress() {
    return this.time / SHIFT_SECONDS;
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
      this.presence?.update(dt, this.progress);
      this._updateEntity(dt);
    }
    this._refreshHud();

    if (this.time >= SHIFT_SECONDS) this.endShift('clock');
  }

  // ---- world simulation ----------------------------------------------------

  _updateIncidents() {
    if (this.time < this.nextIncidentAt || this.time > SHIFT_SECONDS - 90) return;
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
    for (const aisle of AISLES) {
      if (walk.visited.has(aisle.name)) continue;
      if (this.player.position.distanceTo(aisle.pos) > 2.6) continue;
      walk.visited.add(aisle.name);
      walk.remaining = AISLES.length - walk.visited.size;
      this.audio?.blip();
      if (walk.remaining === 0) this._completeTask(walk, `Walkthrough logged — ${AISLES.length} aisles clear`);
      else this.hud.say(`Inspected ${aisle.name} (${walk.visited.size}/${AISLES.length})`);
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
    if (this.entity.state === 'dormant' && this.progress > 0.22) {
      this.entity.spawn();
      this.hud.say('Somewhere down the hall, a door you did not open.', 'bad');
    }
    this.entity.update(dt);
    this.noise = Math.max(0, this.noise - dt * 1.6);
  }

  /**
   * How much of a noise actually carries. A full fan wall swallows most of it;
   * a hall with the cooling down carries nearly all of it. This is the whole
   * reason a CRAC failure is frightening rather than just hot.
   */
  get masking() {
    return 0.25 + this._humLevel * 0.55;
  }

  /** Anything the player does that makes a sound. */
  emitNoise(loudness, position = this.player.position) {
    if (this.mode !== 'night' || this.phase !== 'running') return;
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

  /** §6: you lose an hour, not the session. */
  playerCaught() {
    if (this.phase !== 'running') return;
    this.phase = 'caught';
    this.stats.caught++;
    this.audio?.stinger();
    this.entity?.despawn();

    this.time = Math.min(SHIFT_SECONDS - 1, this.time + SHIFT_SECONDS / 12);
    this.uptime = Math.max(90, this.uptime - 0.4);
    for (const rack of this.racks) rack.temp += 2.5;
    this.carrying = null;
    this.entityGraceUntil = this.time + 75;
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

    if (!this.handoverAdded && this.time > SHIFT_SECONDS * 0.82) {
      this.handoverAdded = true;
      this.tasks.push(createHandoverTask(this.noc));
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
          this.carrying = ITEMS.deadDrive;
          this.audio?.success();
          if (task) {
            task.need = null;
            task.stage = 'dispose';
            task.title = `Dispose failed drive from ${rack.id}`;
            task.hint = 'E-waste bin, south-west corner';
          }
          this.hud.say(`New drive online in ${rack.id}. Array rebuilding.`, 'good');
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
      case 'noc':
        return this._nocAction(station);
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
    return {
      label: ups.label,
      hint: `Battery ${Math.round(ups.charge * 100)}% · load ${Math.round(ups.load * 100)}%`,
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
      const next = AISLES.find((a) => !task.visited.has(a.name));
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

  _updateScreens(dt) {
    this._screenAcc += dt;
    if (this._screenAcc < 0.25) return;
    const step = this._screenAcc;
    this._screenAcc = 0;

    for (const crac of this.byKind('crac')) {
      const cooling = crac.running ? (crac.filterClogged ? 0.45 : 1) : 0;
      crac.supply += ((crac.running ? 16.5 + (1 - cooling) * 6 : 26) - crac.supply) * 0.15;
      crac.ret += ((this.hallTemp + 5.5) - crac.ret) * 0.12;
      crac.filterHours += step * 3;
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
      ups.charge = THREE.MathUtils.clamp(
        ups.charge + (ups.onBattery ? -step * 0.006 : step * 0.002), 0, 1,
      );
      ups.screen.paint((g, w, h) => {
        Screen.bg(g, w, h, ups.onBattery ? '#1c1406' : '#06121a');
        Screen.text(g, ups.label, 12, 28, 20, '#4cc2ff');
        Screen.text(g, ups.onBattery ? 'ON BATTERY' : 'ON MAINS', 12, 54, 18,
          ups.onBattery ? '#ffc247' : '#46d39a');
        Screen.text(g, `LOAD ${Math.round(ups.load * 100)}%`, 12, 78, 16, '#d8e6f2');
        Screen.bar(g, 12, 86, w - 24, 8, ups.charge, '#46d39a');
        Screen.text(g, `BATT ${Math.round(ups.charge * 100)}%`, 12, h - 12, 15, '#7d93a6');
      });
    }

    const vesda = this.stations.find((s) => s.kind === 'fire');
    vesda.screen.paint((g, w, h) => {
      Screen.bg(g, w, h, '#12060a');
      Screen.text(g, 'VESDA', 12, 30, 20, '#ff8a8a');
      Screen.text(g, 'ALL ZONES NORMAL', 12, 56, 15, '#46d39a');
      Screen.text(g, `SMOKE 0.003%/m`, 12, h - 12, 14, '#7d93a6');
    });

    this._paintNoc();
  }

  _paintNoc() {
    const [left, center, right] = this.noc.monitors;
    const open = this.openTasks;

    left.paint((g, w, h) => {
      Screen.bg(g, w, h);
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
      clock: this.clockText,
    };
    return this.report;
  }
}
