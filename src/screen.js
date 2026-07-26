import * as THREE from 'three';

/**
 * A small in-world display backed by a 2D canvas. Cheap enough to repaint a
 * few times a second, which is all a status readout needs.
 */
export class Screen {
  constructor(width, height, px = 256) {
    this.width = width;
    this.height = height;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(width * px);
    this.canvas.height = Math.round(height * px);
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false }),
    );
    this._acc = 0;
  }

  /** Repaint at most `hz` times per second. */
  tick(dt, hz, painter) {
    this._acc += dt;
    if (this._acc < 1 / hz) return;
    this._acc = 0;
    this.paint(painter);
  }

  paint(painter) {
    const g = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    g.clearRect(0, 0, w, h);
    painter(g, w, h);
    this.texture.needsUpdate = true;
  }

  static bg(g, w, h, color = '#06121a') {
    g.fillStyle = color;
    g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(76,194,255,0.35)';
    g.lineWidth = 3;
    g.strokeRect(3, 3, w - 6, h - 6);
  }

  static text(g, str, x, y, size, color = '#d8e6f2', align = 'left') {
    g.fillStyle = color;
    g.font = `${size}px ui-monospace, Menlo, monospace`;
    g.textAlign = align;
    g.textBaseline = 'alphabetic';
    g.fillText(str, x, y);
  }

  static bar(g, x, y, w, h, frac, color) {
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(x, y, w, h);
    g.fillStyle = color;
    g.fillRect(x, y, Math.max(0, Math.min(1, frac)) * w, h);
  }
}
