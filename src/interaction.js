import * as THREE from 'three';
import { pickables } from './pickables.js';

const RANGE = 2.8;

/**
 * Centre-screen raycast that turns whatever you are looking at into an action.
 * `resolve(target)` is supplied by the game and returns
 * `{ label, hint, holdTime, run }` or null when nothing can be done.
 */
export class Interaction {
  constructor(camera, scene, resolve) {
    this.camera = camera;
    this.scene = scene;
    this.resolve = resolve;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = RANGE;
    this.pointer = new THREE.Vector2(0, 0);
    this._hits = [];
    this.action = null;
    this.target = null;
    this.holding = false;
    this.progress = 0;
    this.enabled = true;

    addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && !e.repeat) this.holding = true;
    });
    addEventListener('keyup', (e) => {
      if (e.code === 'KeyE') {
        this.holding = false;
        this.progress = 0;
      }
    });
    addEventListener('blur', () => {
      this.holding = false;
      this.progress = 0;
    });
  }

  /**
   * Nearest hit wins, and the first hit always decides: an untagged mesh in
   * the list is a wall or a rack body, so it blocks whatever sits behind it.
   */
  _pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this._hits.length = 0;
    this.raycaster.intersectObjects(pickables, false, this._hits);
    const hit = this._hits[0];
    if (!hit) return null;
    const data = hit.object.userData;
    return data.rack ?? data.station ?? null;
  }

  update(dt) {
    if (!this.enabled) {
      this.action = null;
      this.target = null;
      return;
    }
    this.target = this._pick();
    const action = this.target ? this.resolve(this.target) : null;

    if (!action || action.label !== this.action?.label) this.progress = 0;
    this.action = action;
    if (!action) return;

    if (!this.holding) {
      this.progress = 0;
      return;
    }
    if (action.disabled) return;

    const hold = action.holdTime ?? 0;
    if (hold <= 0) {
      this.holding = false;
      this.progress = 0;
      action.run();
      return;
    }
    this.progress += dt / hold;
    if (this.progress >= 1) {
      this.progress = 0;
      this.holding = false;
      action.run();
    }
  }
}
