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

  _buildModel() {
    const group = new THREE.Group();
    // near-black, high roughness: it holds shape in torchlight and vanishes
    // completely outside it
    const skin = new THREE.MeshStandardMaterial({
      color: 0x05070a,
      roughness: 1,
      metalness: 0,
    });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.15, 4, 10), skin);
    torso.position.y = 1.28;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), skin);
    head.position.y = 2.06;
    head.scale.set(1, 1.25, 0.9);
    group.add(head);

    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 1.0, 4, 8), skin);
      arm.position.set(side * 0.3, 1.3, 0);
      arm.rotation.z = side * 0.07;
      group.add(arm);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.85, 4, 8), skin);
      leg.position.set(side * 0.13, 0.45, 0);
      group.add(leg);
    }

    // it has no eyes; these are just where the light gets caught
    const glintMat = new THREE.MeshBasicMaterial({ color: 0x3a1114, toneMapped: false });
    for (const side of [-1, 1]) {
      const glint = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 6), glintMat);
      glint.position.set(side * 0.06, 2.08, 0.14);
      group.add(glint);
    }
    return group;
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
    this.position.copy(far.pos);
    this.group.visible = true;
    this.state = 'patrol';
    this.nextNode = far;
    this._repath(this._randomNode().pos);
    this.audio?.stinger();
  }

  despawn() {
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
    if (!wasChasing && this.state === 'chase') this.audio?.whisper(0);
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

    if (this.state === 'chase' && this.sinceHeard > LOSE_AFTER) {
      this.state = 'investigate';
      this.hud?.say('It stops. Somewhere, so does something else.', 'warn');
    }
    if (this.state === 'investigate' && this.sinceHeard > LOSE_AFTER * 2.2) {
      this.state = 'patrol';
      this._repath(this._randomNode().pos);
    }

    this._advance(dt);
    this._pressure(dt);
    this._check();
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

    if (inContainment(this.player.position)) {
      // it will not come in. it waits.
      if (this.state === 'chase' && distance < 6) this.sinceHeard = 0;
      return;
    }
    if (distance < CATCH_RANGE) this.onCatch?.();

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
