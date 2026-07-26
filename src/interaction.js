import * as THREE from 'three';

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

  _pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.scene.children, true);
    for (const hit of hits) {
      let obj = hit.object;
      while (obj) {
        const data = obj.userData;
        if (data.rack) return data.rack;
        if (data.station) return data.station;
        obj = obj.parent;
      }
      // an opaque non-interactive surface blocks anything behind it
      if (hit.object.visible && hit.object.type === 'Mesh') return null;
    }
    return null;
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
