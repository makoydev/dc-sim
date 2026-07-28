import * as THREE from 'three';
import { inContainment } from './world.js';

/**
 * It is blind. It hunts sound.
 *
 * Movement is on a waypoint graph laid over the aisles — long runs down each
 * aisle, joined only at the two ends, which is what makes the hall's geometry
 * matter. It will not enter cold aisle containment; it waits at the end of the
 * aisle instead, which is worse.
 */

// z of every aisle it can walk, and the two cross corridors past the rack ends
const AISLE_Z = [-9.8, -7.05, -3.7, -0.45, 2.85, 6.15, 9.3];
const NODE_X = [-6.6, -4, -2, 0, 2, 4, 6.6];
const END_X = [-6.6, 6.6];

const ENTITY_LED = new THREE.Color(0x3a0d0d);
const SPEED = { patrol: 1.35, investigate: 1.9, chase: 2.9 };

/** Distance on the floor plane — it walks, the player's position is eye height. */
const planar = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const CATCH_RANGE = 1.15;
const LOSE_AFTER = 7; // seconds without a noise before it gives up a chase
// once it is this close it has you, and holding still will not save you
const LOCK_RANGE = 9;
const RELOCK_EVERY = 0.4;

function buildGraph() {
  const nodes = [];
  for (const z of AISLE_Z) {
    for (const x of NODE_X) {
      nodes.push({
        id: nodes.length,
        pos: new THREE.Vector3(x, 0, z),
        contained: inContainment(new THREE.Vector3(x, 0, z)),
        links: [],
      });
    }
  }
  const at = (x, z) => nodes.find((n) => n.pos.x === x && n.pos.z === z);
  for (const z of AISLE_Z) {
    for (let i = 0; i < NODE_X.length - 1; i++) {
      const a = at(NODE_X[i], z);
      const b = at(NODE_X[i + 1], z);
      a.links.push(b.id);
      b.links.push(a.id);
    }
  }
  // the ends of the rows are the only way between aisles
  for (const x of END_X) {
    for (let i = 0; i < AISLE_Z.length - 1; i++) {
      const a = at(x, AISLE_Z[i]);
      const b = at(x, AISLE_Z[i + 1]);
      a.links.push(b.id);
      b.links.push(a.id);
    }
  }
  return nodes;
}

export class Entity {
  constructor({ scene, player, racks, hud, audio }) {
    this.player = player;
    this.racks = racks;
    this.hud = hud;
    this.audio = audio;

    this.nodes = buildGraph();
    this.state = 'dormant';
    this.position = new THREE.Vector3(-6.6, 0, 9.3);
    this.path = [];
    this.nextNode = null;
    this.target = null;
    this.sinceHeard = 99;
    this.sinceStep = 0;
    this.sinceBreath = 0;
    this.lastNoise = new THREE.Vector3();
    this.onCatch = null;
    this.onSabotage = null;
    this.sabotageCooldown = 45;

    this.group = this._buildModel();
    this.group.visible = false;
    scene.add(this.group);
  }

  /**
   * Proportions do the work: two and a half metres of it, shoulders narrower
   * than a person's, forearms that hang past the knees, and knees that bend the
   * wrong way. Slightly glossy rather than matte, so the torch finds an edge of
   * it before you can make out the shape.
   */
  _buildModel() {
    const group = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({
      color: 0x06080b,
      roughness: 0.36,
      metalness: 0.08,
    });
    const limb = (radius, length) =>
      new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 8), skin);

    const pelvis = new THREE.Group();
    pelvis.position.y = 1.12;
    group.add(pelvis);

    // hunched, so the head leads
    const spine = new THREE.Group();
    spine.rotation.x = 0.26;
    pelvis.add(spine);

    const torso = limb(0.145, 0.72);
    torso.position.y = 0.4;
    torso.scale.z = 0.7; // flattened front to back
    spine.add(torso);

    const neck = limb(0.05, 0.22);
    neck.position.y = 0.86;
    spine.add(neck);

    const head = new THREE.Group();
    head.position.y = 1.02;
    spine.add(head);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 12), skin);
    skull.scale.set(0.82, 1.45, 0.86);
    head.add(skull);
    const jaw = limb(0.05, 0.16);
    jaw.position.set(0, -0.11, 0.06);
    jaw.rotation.x = 0.5;
    head.add(jaw);

    // no face. these are only where the light gets caught
    const glintMat = new THREE.MeshBasicMaterial({ color: 0x4a1418, toneMapped: false });
    const glints = [];
    for (const side of [-1, 1]) {
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.026, 7, 7), glintMat);
      glint.position.set(side * 0.052, 0.05, 0.1);
      head.add(glint);
      glints.push(glint);
    }

    const arms = [];
    const legs = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.15, 0.74, 0);
      spine.add(shoulder);
      const upper = limb(0.05, 0.52);
      upper.position.y = -0.26;
      shoulder.add(upper);
      const elbow = new THREE.Group();
      elbow.position.y = -0.52;
      shoulder.add(elbow);
      const fore = limb(0.042, 0.62);
      fore.position.y = -0.31;
      elbow.add(fore);
      const hand = limb(0.035, 0.16);
      hand.position.y = -0.66;
      elbow.add(hand);
      arms.push({ shoulder, elbow });

      const hip = new THREE.Group();
      hip.position.set(side * 0.09, 0, 0);
      pelvis.add(hip);
      const thigh = limb(0.062, 0.46);
      thigh.position.y = -0.25;
      hip.add(thigh);
      const knee = new THREE.Group();
      knee.position.y = -0.5;
      knee.rotation.x = -0.5; // backwards, like a bird's
      hip.add(knee);
      const shin = limb(0.05, 0.44);
      shin.position.y = -0.24;
      knee.add(shin);
      const foot = limb(0.045, 0.2);
      foot.position.set(0, -0.48, 0.06);
      foot.rotation.x = 1.3;
      knee.add(foot);
      legs.push({ hip, knee });
    }

    this.parts = { pelvis, spine, head, glints, glintMat, arms, legs };
    this.gait = 0;
    return group;
  }

  /**
   * A figure sliding along the floor reads as a bug. Give it a walk and it
   * reads as something walking towards you.
   */
  _animate(dt, speed) {
    const { pelvis, spine, head, glintMat, arms, legs } = this.parts;
    const chasing = this.state === 'chase';
    this.gait += speed * dt * 2.1;

    const swing = Math.sin(this.gait);
    const counter = Math.sin(this.gait + Math.PI);
    legs[0].hip.rotation.x = swing * 0.5;
    legs[1].hip.rotation.x = counter * 0.5;
    legs[0].knee.rotation.x = -0.5 - Math.max(0, -swing) * 0.6;
    legs[1].knee.rotation.x = -0.5 - Math.max(0, -counter) * 0.6;
    arms[0].shoulder.rotation.x = counter * 0.34;
    arms[1].shoulder.rotation.x = swing * 0.34;
    arms[0].elbow.rotation.x = -0.15 - Math.abs(counter) * 0.2;
    arms[1].elbow.rotation.x = -0.15 - Math.abs(swing) * 0.2;

    // it leans into a chase, and the head never quite sits straight
    spine.rotation.x += ((chasing ? 0.46 : 0.26) - spine.rotation.x) * Math.min(1, dt * 2);
    head.rotation.z = Math.sin(this.gait * 0.37) * 0.16;
    head.rotation.x = Math.sin(this.gait * 0.21) * 0.1 - (chasing ? 0.12 : 0);
    pelvis.position.y = 1.12 + Math.abs(Math.sin(this.gait)) * 0.035;

    const heat = chasing ? 0.75 + Math.sin(this.gait * 4) * 0.25 : 0.28;
    glintMat.color.setRGB(0.29 * heat + 0.05, 0.05 * heat, 0.06 * heat);
  }

  // ---- lifecycle -----------------------------------------------------------

  spawn() {
    if (this.state !== 'dormant') return;
    // arrive at the far end from wherever the player is
    const far = this.nodes
      .filter((n) => !n.contained)
      .sort(
        (a, b) =>
          b.pos.distanceToSquared(this.player.position) -
          a.pos.distanceToSquared(this.player.position),
      )[0];
    this.teleport(far.pos);
    this.group.visible = true;
    this.state = 'patrol';
    this._repath(this._randomNode().pos);
    this.audio?.arrival();
  }

  /** Put it somewhere directly, discarding any path it was part way along. */
  teleport(position) {
    this.position.set(position.x, 0, position.z);
    this.path = [];
    this.nextNode = this._nearestNode(this.position);
    this.group.position.copy(this.position);
  }

  despawn() {
    this.audio?.stopChase();
    this.state = 'dormant';
    this.group.visible = false;
    this.path = [];
    this.nextNode = null;
  }

  /**
   * Something made a noise. `loudness` is already masked by the fan wall —
   * see Game#emitNoise.
   */
  hear(loudness, position) {
    if (this.state === 'dormant' || loudness <= 0) return;
    const distance = planar(this.position, position);
    const range = 6 + loudness * 26;
    if (distance > range) return;

    this.sinceHeard = 0;
    this.lastNoise.copy(position);
    const wasChasing = this.state === 'chase';
    this.state = loudness > 0.45 || distance < 7 ? 'chase' : 'investigate';
    this._repath(position);
    if (!wasChasing && this.state === 'chase') {
      this.audio?.whisper(0);
      this.audio?.startChase();
    }
  }

  // ---- navigation ----------------------------------------------------------

  _nearestNode(position, allowContained = false) {
    let best = null;
    let bestD = Infinity;
    for (const node of this.nodes) {
      if (node.contained && !allowContained) continue;
      const d = node.pos.distanceToSquared(position);
      if (d < bestD) {
        bestD = d;
        best = node;
      }
    }
    return best;
  }

  _randomNode() {
    const open = this.nodes.filter((n) => !n.contained);
    return open[Math.floor(Math.random() * open.length)];
  }

  /**
   * Breadth-first over the aisle graph; it is 49 nodes, nothing fancier is
   * needed. Paths always start from the node it is already walking towards,
   * never the nearest one — otherwise a repath mid-aisle turns it around, and
   * a hunter that repaths twice a second never gets anywhere.
   */
  _repath(destination) {
    const start = this.nextNode ?? this._nearestNode(this.position);
    const goal = this._nearestNode(destination);
    if (!start || !goal) return;

    const cameFrom = new Map([[start.id, null]]);
    const queue = [start];
    while (queue.length) {
      const current = queue.shift();
      if (current === goal) break;
      for (const id of current.links) {
        if (cameFrom.has(id)) continue;
        const next = this.nodes[id];
        if (next.contained) continue;
        cameFrom.set(id, current.id);
        queue.push(next);
      }
    }
    if (!cameFrom.has(goal.id)) return;

    const path = [];
    for (let id = goal.id; id != null; id = cameFrom.get(id)) {
      path.unshift(this.nodes[id]);
      if (cameFrom.get(id) == null) break;
    }
    this.path = path;
    this.nextNode = path[0] ?? null;
    this.target = destination.clone ? destination.clone() : null;
  }

  // ---- per-frame -----------------------------------------------------------

  update(dt) {
    if (this.state === 'dormant') return;

    this.sinceHeard += dt;
    this.sabotageCooldown -= dt;
    this._lockOn(dt);

    if (this.state === 'chase' && this.sinceHeard > LOSE_AFTER) {
      this.state = 'investigate';
      this.audio?.stopChase();
      this.hud?.say('It stops. Somewhere, so does something else.', 'warn');
    }
    if (this.state === 'investigate' && this.sinceHeard > LOSE_AFTER * 2.2) {
      this.state = 'patrol';
      this._repath(this._randomNode().pos);
    }
    // an investigation is a search, not a walk to a spot and a stand
    if (this.state === 'investigate' && !this.path.length) this._searchNear(this.lastNoise);

    this._advance(dt);
    this._pressure(dt);
    this._pulse(dt);
    this._check();
  }

  /**
   * Close range is not a hearing problem. Once it is within `LOCK_RANGE` it
   * knows where you are and keeps coming — standing still only works at a
   * distance. Containment and cabinets still break it, because those are
   * physical, not quiet.
   */
  _lockOn(dt) {
    if (this.state !== 'chase') return;
    if (this.isPlayerHidden?.()) return;
    if (inContainment(this.player.position)) return;
    if (planar(this.position, this.player.position) > LOCK_RANGE) return;

    this.sinceHeard = 0;
    this.sinceRelock = (this.sinceRelock ?? 0) + dt;
    if (this.sinceRelock < RELOCK_EVERY) return;
    this.sinceRelock = 0;
    this.lastNoise.copy(this.player.position);
    this._repath(this.player.position);
  }

  /** Casts around near the last thing it heard instead of standing over it. */
  _searchNear(origin) {
    const near = this.nodes.filter(
      (n) => !n.contained && planar(n.pos, origin) < 6.5,
    );
    const pick = near.length
      ? near[Math.floor(Math.random() * near.length)]
      : this._randomNode();
    this._repath(pick.pos);
  }

  /**
   * Chase layer tracks how close it is, and your own heart takes over once it
   * is inside about eight metres.
   */
  _pulse(dt) {
    const nearness = this._nearness();
    if (this.state === 'chase') this.audio?.setChaseIntensity(nearness);

    const close = this.distanceToPlayer < 9 && this.state !== 'patrol';
    if (!close) return;
    this.sinceBeat = (this.sinceBeat ?? 0) + dt;
    const rate = THREE.MathUtils.lerp(1.15, 0.42, nearness);
    if (this.sinceBeat >= rate) {
      this.sinceBeat = 0;
      this.audio?.heartbeat(0.5 + nearness * 0.8);
    }
  }

  _advance(dt) {
    if (!this.path.length) {
      if (this.state === 'patrol') this._repath(this._randomNode().pos);
      return;
    }
    const speed = SPEED[this.state] ?? SPEED.patrol;
    const next = this.path[0].pos;
    const step = speed * dt;
    const distance = this.position.distanceTo(next);

    if (distance <= step) {
      this.position.copy(next);
      this.path.shift();
      this.nextNode = this.path[0] ?? null;
    } else {
      this.position.lerp(next, step / distance);
    }

    this.group.position.copy(this.position);
    this._animate(dt, speed);
    const facing = this.path[0]?.pos ?? next;
    if (!facing.equals(this.position)) {
      this.group.rotation.y = Math.atan2(
        facing.x - this.position.x, facing.z - this.position.z,
      );
    }

    // its own footsteps, panned by bearing — the main way you track it
    this.sinceStep += dt;
    const cadence = this.state === 'chase' ? 0.34 : 0.72;
    if (this.sinceStep > cadence) {
      this.sinceStep = 0;
      this.audio?.footstep(this.state === 'chase', this._pan(), this._nearness() * 1.4);
    }
    this.sinceBreath += dt;
    if (this.sinceBreath > 4.5 && this._nearness() > 0.25) {
      this.sinceBreath = 0;
      this.audio?.whisper(this._pan());
    }
  }

  /** Nearby racks lose their minds — a tell that works with the torch off. */
  _pressure() {
    for (const rack of this.racks) {
      if (rack.ledOverride && !rack._entityLed) continue;
      const near = planar(rack.group.position, this.position) < 3.2;
      if (near) {
        rack.ledOverride = Math.random() > 0.55 ? null : ENTITY_LED;
        rack._entityLed = true;
      } else if (rack._entityLed) {
        rack.ledOverride = null;
        rack._entityLed = false;
      }
    }
  }

  _check() {
    const distance = planar(this.position, this.player.position);

    // it cannot find you in a cabinet, but it can wait outside one
    if (this.isPlayerHidden?.()) return;

    // it will not come in. it loses you slowly, and searches the ends.
    if (inContainment(this.player.position)) return;
    if (distance < CATCH_RANGE) {
      this.audio?.caught();
      this.onCatch?.();
    }

    // when it is close and hunting, it starts turning things off
    if (
      this.state === 'chase' &&
      this.sabotageCooldown <= 0 &&
      distance < 12 &&
      Math.random() < 0.5
    ) {
      this.sabotageCooldown = 60;
      this.onSabotage?.(this.position);
    }
  }

  /** 0 far away, 1 on top of you. */
  _nearness() {
    return THREE.MathUtils.clamp(1 - planar(this.position, this.player.position) / 22, 0, 1);
  }

  _pan() {
    const to = this.position.clone().sub(this.player.position).setY(0).normalize();
    const yaw = this.player.yaw;
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = forward.z * to.x - forward.x * to.z;
    return THREE.MathUtils.clamp(right * 1.4, -1, 1);
  }

  get distanceToPlayer() {
    return planar(this.position, this.player.position);
  }
}
