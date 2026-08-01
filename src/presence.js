import * as THREE from 'three';
import { rig } from './world.js';

/**
 * There is nothing in the hall. That is the point.
 *
 * The director schedules events that imply company — a light that strikes and
 * fails, footsteps one aisle over that stop when you stop, a fault appearing on
 * a rack you walked past a minute ago. It biases everything toward where the
 * player is not looking, and gets bolder as the shift wears on.
 */

const AMBER = new THREE.Color(0xffc247);

export class Presence {
  constructor({ camera, player, racks, hud, audio }) {
    this.camera = camera;
    this.player = player;
    this.racks = racks;
    this.hud = hud;
    this.audio = audio;

    this.dread = 0; // 0..1, ramps across the shift
    this.time = 0;
    this.nextAt = 45;
    this.effects = [];
    this.lastEvent = null;
    this._forward = new THREE.Vector3();
    this._toward = new THREE.Vector3();
  }

  /** Where a sound at `pos` should sit in the stereo field. */
  panFor(pos) {
    this.camera.getWorldDirection(this._forward);
    this._toward.copy(pos).sub(this.player.position).setY(0).normalize();
    const right = this._forward.z * this._toward.x - this._forward.x * this._toward.z;
    return THREE.MathUtils.clamp(right * 1.4, -1, 1);
  }

  behindPlayer(pos) {
    this.camera.getWorldDirection(this._forward);
    this._toward.copy(pos).sub(this.player.position).setY(0);
    return this._forward.dot(this._toward) < 0;
  }

  /** A rack the player cannot currently see, preferring ones close by. */
  pickUnseenRack() {
    const candidates = this.racks.filter((r) => {
      if (r.fault) return false;
      const d = r.group.position.distanceTo(this.player.position);
      return d > 4 && d < 16 && this.behindPlayer(r.group.position);
    });
    if (!candidates.length) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  update(dt, shiftProgress) {
    this.time += dt;
    this.dread = THREE.MathUtils.clamp(shiftProgress * 1.2, 0, 1);

    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.t += dt;
      effect.tick(effect.t, dt);
      if (effect.t >= effect.life) {
        effect.done?.();
        this.effects.splice(i, 1);
      }
    }

    if (this.time < this.nextAt) return;
    // events crowd together as the shift wears on: 70s apart early, 25s late
    const gap = THREE.MathUtils.lerp(70, 25, this.dread);
    this.nextAt = this.time + gap * (0.6 + Math.random() * 0.8);
    this.fire();
  }

  fire() {
    const pool = ['flicker', 'clang', 'creak', 'footsteps'];
    if (this.dread > 0.25) pool.push('ledWave', 'doorSlam');
    if (this.dread > 0.5) pool.push('phantomFault', 'whisper', 'footsteps');
    if (this.dread > 0.75) pool.push('blackout', 'phantomFault');

    let pick = pool[Math.floor(Math.random() * pool.length)];
    if (pick === this.lastEvent) pick = pool[Math.floor(Math.random() * pool.length)];
    this.lastEvent = pick;
    this[pick]?.();
  }

  // ---- events --------------------------------------------------------------

  /** A troffer strikes, fails, and gives up. */
  flicker() {
    // a fitting the bank has already shed cannot strike, so pick one still lit
    const lit = rig.emergency.filter((e) => !e.shed);
    const entry = lit[Math.floor(Math.random() * lit.length)];
    if (!entry) return;
    this.audio?.ballastBuzz(this.panFor(entry.lamp.position));
    this.effects.push({
      t: 0,
      life: 1.6,
      tick: () => {
        entry.lamp.intensity =
          Math.random() > 0.4 ? entry.base * (0.2 + Math.random()) : 0;
      },
      done: () => {
        entry.lamp.intensity = entry.base;
      },
    });
  }

  clang() {
    const pos = this.awayFromPlayer();
    this.audio?.clang(this.panFor(pos));
  }

  creak() {
    const pos = this.awayFromPlayer();
    this.audio?.creak(this.panFor(pos));
  }

  doorSlam() {
    const pos = this.awayFromPlayer();
    this.audio?.doorSlam(this.panFor(pos));
    this.hud?.say('A door closes somewhere behind you.', 'warn');
  }

  whisper() {
    this.audio?.whisper(Math.random() * 2 - 1);
  }

  /** Someone walking the next aisle over, at your pace, stopping when you stop. */
  footsteps() {
    const side = Math.random() > 0.5 ? 1 : -1;
    const start = this.player.position.clone().add(new THREE.Vector3(side * 4, 0, -6));
    const step = new THREE.Vector3(0, 0, 1.1);
    let count = 0;
    let acc = 0;
    this.effects.push({
      t: 0,
      life: 4.2,
      tick: (t, dt) => {
        acc += dt;
        if (acc < 0.52) return;
        acc = 0;
        // it only walks while you do
        if (this.player.velocity.lengthSq() < 0.6) return;
        start.add(step);
        count++;
        this.audio?.footstep(false, this.panFor(start), 0.75);
      },
      done: () => {
        if (count > 2) this.hud?.say('Footsteps, one aisle over. Then nothing.', 'warn');
      },
    });
  }

  /** Amber rolls down a row of racks, like something passing behind them. */
  ledWave() {
    const row = ['A', 'B', 'C', 'D', 'E', 'F'][Math.floor(Math.random() * 6)];
    const inRow = this.racks
      .filter((r) => r.row === row)
      .sort((a, b) => a.group.position.x - b.group.position.x);
    if (!inRow.length) return;
    const reverse = Math.random() > 0.5;
    if (reverse) inRow.reverse();

    this.audio?.creak(this.panFor(inRow[0].group.position));
    this.effects.push({
      t: 0,
      life: 2.4,
      tick: (t) => {
        const head = (t / 2.4) * inRow.length;
        inRow.forEach((rack, i) => {
          rack.ledOverride = Math.abs(i - head) < 1.6 ? AMBER : null;
        });
      },
      done: () => inRow.forEach((rack) => (rack.ledOverride = null)),
    });
  }

  /** A rack behind you quietly develops a fault. No page, no ticket noise. */
  phantomFault() {
    const rack = this.pickUnseenRack();
    if (!rack) return;
    rack.fault = { type: 'drive', severity: 'warning', phantom: true };
    this.audio?.creak(this.panFor(rack.group.position));
  }

  /** The emergency lighting drops out entirely, for two very long seconds. */
  blackout() {
    this.audio?.stinger();
    this.hud?.say('Emergency lighting dropped.', 'bad');
    this.effects.push({
      t: 0,
      life: 2.2,
      tick: (t) => {
        // comes back weak before it comes back properly
        for (const entry of rig.emergency) {
          entry.lamp.intensity = t > 1.9 ? entry.base * 0.35 : 0;
        }
      },
      done: () => rig.emergency.forEach((entry) => (entry.lamp.intensity = entry.base)),
    });
  }

  /** A point in the hall well away from the player, for placing a sound. */
  awayFromPlayer() {
    const angle = Math.random() * Math.PI * 2;
    const distance = 8 + Math.random() * 7;
    return new THREE.Vector3(
      THREE.MathUtils.clamp(this.player.position.x + Math.cos(angle) * distance, -12, 12),
      1.5,
      THREE.MathUtils.clamp(this.player.position.z + Math.sin(angle) * distance, -10, 10),
    );
  }
}
