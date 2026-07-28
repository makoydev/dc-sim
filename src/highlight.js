import * as THREE from 'three';

const ACTIVE = new THREE.Color(0x4cc2ff);
const BLOCKED = new THREE.Color(0xffc247);
const PAD = 0.05;
const ARM = 0.22; // corner arm length, as a fraction of each edge

/** Eight corner brackets on a unit cube centred at the origin. */
function bracketGeometry() {
  const points = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const corner = [sx * 0.5, sy * 0.5, sz * 0.5];
        for (let axis = 0; axis < 3; axis++) {
          const end = corner.slice();
          end[axis] -= Math.sign(corner[axis]) * ARM;
          points.push(...corner, ...end);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  return geometry;
}

/**
 * Draws focus brackets around whatever the crosshair is resolving to, so the
 * hall reads as touchable before you get close enough for a prompt.
 */
export class Highlighter {
  constructor(scene) {
    this.material = new THREE.LineBasicMaterial({
      color: ACTIVE,
      transparent: true,
      opacity: 0.9,
      depthTest: false,
      toneMapped: false,
    });
    this.lines = new THREE.LineSegments(bracketGeometry(), this.material);
    this.lines.renderOrder = 999;
    this.lines.visible = false;
    this.lines.frustumCulled = false;
    scene.add(this.lines);

    this.bounds = new WeakMap();
    this.target = null;
    this._size = new THREE.Vector3();
    this._center = new THREE.Vector3();
  }

  _boundsFor(target) {
    if (target.bounds) return target.bounds; // props measure themselves once
    let box = this.bounds.get(target.group);
    if (!box) {
      box = new THREE.Box3().setFromObject(target.group);
      this.bounds.set(target.group, box);
    }
    return box;
  }

  /** `target` is a rack or a station; null clears the brackets. */
  setTarget(target, blocked = false) {
    if (!target) {
      this.target = null;
      this.lines.visible = false;
      return;
    }
    this.material.color.copy(blocked ? BLOCKED : ACTIVE);
    if (target === this.target) return;

    this.target = target;
    const box = this._boundsFor(target);
    box.getSize(this._size);
    box.getCenter(this._center);
    this.lines.position.copy(this._center);
    this.lines.scale.set(
      this._size.x + PAD,
      this._size.y + PAD,
      this._size.z + PAD,
    );
    this.lines.visible = true;
  }

  update(elapsed) {
    if (!this.lines.visible) return;
    this.material.opacity = 0.6 + Math.sin(elapsed * 4.5) * 0.28;
  }
}
