import * as THREE from 'three';

const FULL_BURN = 420; // seconds of light on a fresh cell
const LOW = 0.22;

/**
 * The hand torch. Rides on the camera, lags slightly behind where you look so
 * it feels carried rather than welded on, and runs down a battery you will
 * resent spending.
 */
export class Torch {
  constructor(camera, scene) {
    this.camera = camera;
    this.on = false;
    this.battery = 1;
    this.flicker = 1;

    this.light = new THREE.SpotLight(0xfff0d8, 0, 26, 0.52, 0.55, 1.6);
    this.light.position.set(0.22, -0.16, 0);
    camera.add(this.light);

    this.target = new THREE.Object3D();
    this.target.position.set(0, 0, -8);
    camera.add(this.target);
    this.light.target = this.target;

    // the camera is not normally part of the scene graph; it has to be for the
    // torch and its target to get world matrices
    scene.add(camera);

    this.sway = new THREE.Vector2();
    addEventListener('keydown', (e) => {
      if (e.code === 'KeyF' && !e.repeat) this.toggle();
    });
  }

  toggle() {
    if (this.battery <= 0) return false;
    this.on = !this.on;
    return this.on;
  }

  update(dt, speed = 0) {
    if (this.on) {
      this.battery = Math.max(0, this.battery - dt / FULL_BURN);
      if (this.battery === 0) this.on = false;
    }

    // a dying cell stutters; a healthy one is steady
    const health = this.battery / LOW;
    this.flicker = this.battery > LOW
      ? 1
      : 0.35 + Math.abs(Math.sin(performance.now() * 0.006)) * 0.45 * health;

    this.light.intensity = this.on ? 34 * this.flicker : 0;

    // the beam trails the walk cycle a little
    const wobble = Math.min(speed / 5, 1);
    this.sway.x += (Math.sin(performance.now() * 0.004) * 0.06 * wobble - this.sway.x) * dt * 6;
    this.sway.y += (Math.cos(performance.now() * 0.003) * 0.04 * wobble - this.sway.y) * dt * 6;
    this.target.position.set(this.sway.x * 8, this.sway.y * 8 - 0.4, -8);
  }

  get low() {
    return this.battery <= LOW;
  }
}
