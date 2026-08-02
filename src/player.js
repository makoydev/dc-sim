import * as THREE from 'three';
import { clampToRooms, colliders } from './world.js';

const EYE = 1.68;
const RADIUS = 0.34;
const WALK = 3.1;
const SPRINT = 5.4;
const ACCEL = 14;

export class Player {
  constructor(camera, domElement) {
    this.camera = camera;
    this.dom = domElement;
    this.position = new THREE.Vector3(0, EYE, -10);
    this.velocity = new THREE.Vector3();
    this.yaw = Math.PI; // start facing into the hall
    this.pitch = 0;
    this.keys = new Set();
    this.locked = false;
    this.sensitivity = 0.0022;
    this.bob = 0;
    this.stamina = 1;
    this.speedScale = 1;
    this.frozen = false;
    this.lookArc = null; // {center, range} while hidden
    this.onFootstep = null;

    this._bind();
    this._apply();
  }

  _bind() {
    this.dom.addEventListener('click', () => {
      if (!this.locked) this.dom.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      document.dispatchEvent(
        new CustomEvent('player-lock', { detail: this.locked }),
      );
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity;
      const limit = Math.PI / 2 - 0.05;
      this.pitch = Math.max(-limit, Math.min(limit, this.pitch));

      // inside a cabinet you only get the slot between the doors
      if (this.lookArc) {
        const { center, range } = this.lookArc;
        let delta = this.yaw - center;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        this.yaw = center + Math.max(-range, Math.min(range, delta));
        this.pitch = Math.max(-0.5, Math.min(0.5, this.pitch));
      }
    });
    addEventListener('keydown', (e) => {
      if (this.frozen && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) return;
      this.keys.add(e.code);
      if (['Tab', 'Space'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  get sprinting() {
    return (
      (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) &&
      this.stamina > 0.05
    );
  }

  update(dt) {
    if (this.frozen) {
      this.velocity.set(0, 0, 0);
      this.stamina = Math.min(1, this.stamina + dt * 0.3);
      this._apply();
      return;
    }
    const forward = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'));
    const strafe = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));

    const wish = new THREE.Vector3();
    if (forward || strafe) {
      const sin = Math.sin(this.yaw);
      const cos = Math.cos(this.yaw);
      // -Z is forward for the camera's default orientation
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe);
      wish.normalize();
    }

    const moving = wish.lengthSq() > 0;
    const speed = (this.sprinting && moving ? SPRINT : WALK) * this.speedScale;
    this.stamina = THREE.MathUtils.clamp(
      this.stamina + (this.sprinting && moving ? -dt * 0.22 : dt * 0.3),
      0,
      1,
    );

    const target = wish.multiplyScalar(speed);
    this.velocity.lerp(target, Math.min(1, ACCEL * dt));
    if (!moving && this.velocity.lengthSq() < 0.01) this.velocity.set(0, 0, 0);

    this._move(this.velocity.x * dt, this.velocity.z * dt);

    // head bob, and a footstep event on each foot plant
    const rate = this.velocity.length() * 1.9;
    const prev = this.bob;
    this.bob += rate * dt;
    if (rate > 0.4 && Math.floor(prev / Math.PI) !== Math.floor(this.bob / Math.PI)) {
      this.onFootstep?.(this.sprinting);
    }
    this._apply(rate);
  }

  _move(dx, dz) {
    this.position.x += dx;
    this.position.z += dz;
    // twice, so a corner where two colliders meet settles instead of leaving
    // the player inside the second one
    this._resolve();
    this._resolve();

    clampToRooms(this.position, RADIUS + 0.2);
  }

  /**
   * Pushes the player out of anything they are standing in, along whichever
   * face is nearest.
   *
   * The nearest face is the point. This used to resolve one axis at a time and
   * pick the side by which half of the box the player was in, which is fine for
   * a box roughly your own size and very wrong for a long one: touching the
   * front of a six-metre shelf run put you level with whichever *end* of it you
   * were nearer, so walking into the tape archive shelving threw you sideways
   * across the room. Minimum penetration is the standard fix and has no such
   * failure mode.
   */
  _resolve() {
    const p = this.position;
    for (const b of colliders) {
      if (b.open) continue; // a door that is standing open is not a wall
      const minX = b.minX - RADIUS;
      const maxX = b.maxX + RADIUS;
      const minZ = b.minZ - RADIUS;
      const maxZ = b.maxZ + RADIUS;
      if (p.x <= minX || p.x >= maxX || p.z <= minZ || p.z >= maxZ) continue;

      const west = p.x - minX;
      const east = maxX - p.x;
      const north = p.z - minZ;
      const south = maxZ - p.z;
      const least = Math.min(west, east, north, south);
      if (least === west) {
        p.x = minX;
        this.velocity.x = 0;
      } else if (least === east) {
        p.x = maxX;
        this.velocity.x = 0;
      } else if (least === north) {
        p.z = minZ;
        this.velocity.z = 0;
      } else {
        p.z = maxZ;
        this.velocity.z = 0;
      }
    }
  }

  _apply(rate = 0) {
    const bobY = rate > 0.4 ? Math.sin(this.bob) * 0.035 : 0;
    const bobX = rate > 0.4 ? Math.cos(this.bob * 0.5) * 0.02 : 0;
    this.camera.position.set(
      this.position.x + bobX,
      this.position.y + bobY,
      this.position.z,
    );
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
