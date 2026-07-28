/**
 * Keeps the frame rate honest on whatever machine this lands on.
 *
 * Retina displays are the trap: at devicePixelRatio 2 the renderer shades four
 * times as many fragments as the CSS size suggests, and every one of them loops
 * every light in the hall. So resolution is the first thing to give up.
 */

const MIN_SCALE = 0.62;
const MAX_SCALE = 1.0;
const STEP = 0.12;

export class Perf {
  constructor(renderer, camera) {
    this.renderer = renderer;
    this.camera = camera;
    this.ceiling = Math.min(devicePixelRatio || 1, 1.5);
    this.scale = MAX_SCALE;
    this.frames = 0;
    this.accum = 0;
    this.fps = 60;
    this.sinceChange = 0;
    this.overlay = null;
    this.apply();

    addEventListener('keydown', (e) => {
      if (e.code === 'F3') this.toggleOverlay();
    });
  }

  apply() {
    this.renderer.setPixelRatio(this.ceiling * this.scale);
  }

  update(dt) {
    this.frames++;
    this.accum += dt;
    this.sinceChange += dt;
    if (this.accum < 0.5) return;

    this.fps = this.frames / this.accum;
    this.frames = 0;
    this.accum = 0;

    // drop resolution quickly when struggling, restore it slowly and only
    // when there is real headroom, so it cannot oscillate
    if (this.fps < 45 && this.scale > MIN_SCALE && this.sinceChange > 1.5) {
      this.scale = Math.max(MIN_SCALE, this.scale - STEP);
      this.sinceChange = 0;
      this.apply();
    } else if (this.fps > 58 && this.scale < MAX_SCALE && this.sinceChange > 6) {
      this.scale = Math.min(MAX_SCALE, this.scale + STEP);
      this.sinceChange = 0;
      this.apply();
    }

    if (this.overlay) this.paint();
  }

  toggleOverlay() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
      return;
    }
    this.overlay = document.createElement('div');
    this.overlay.id = 'perf';
    document.getElementById('ui').appendChild(this.overlay);
    this.paint();
  }

  paint() {
    const info = this.renderer.info;
    this.overlay.innerHTML = `
      <b>${this.fps.toFixed(0)} fps</b>
      <span>calls ${info.render.calls}</span>
      <span>tris ${info.render.triangles.toLocaleString()}</span>
      <span>dpr ${(this.ceiling * this.scale).toFixed(2)}</span>
      <span>progs ${info.programs?.length ?? 0}</span>
      <span>tex ${info.memory.textures}</span>`;
  }
}
