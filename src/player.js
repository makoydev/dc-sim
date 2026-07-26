import * as THREE from 'three';
import { colliders, HALL } from './world.js';

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
    });
    addEventListener('keydown', (e) => {
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
    const speed = this.sprinting && moving ? SPRINT : WALK;
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
    this._resolve('x');
    this.position.z += dz;
    this._resolve('z');

    const pad = RADIUS + 0.2;
    this.position.x = THREE.MathUtils.clamp(
      this.position.x, HALL.minX + pad, HALL.maxX - pad,
    );
    this.position.z = THREE.MathUtils.clamp(
      this.position.z, HALL.minZ + pad, HALL.maxZ - pad,
    );
  }

  _resolve(axis) {
    const p = this.position;
    for (const b of colliders) {
      const nx = THREE.MathUtils.clamp(p.x, b.minX, b.maxX);
      const nz = THREE.MathUtils.clamp(p.z, b.minZ, b.maxZ);
      const dx = p.x - nx;
      const dz = p.z - nz;
      if (dx * dx + dz * dz >= RADIUS * RADIUS) continue;

      if (axis === 'x') {
        p.x = p.x < (b.minX + b.maxX) / 2 ? b.minX - RADIUS : b.maxX + RADIUS;
        this.velocity.x = 0;
      } else {
        p.z = p.z < (b.minZ + b.maxZ) / 2 ? b.minZ - RADIUS : b.maxZ + RADIUS;
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
