import * as THREE from 'three';

/**
 * Bloom and a vignette, done by hand.
 *
 * three ships an EffectComposer and an UnrealBloomPass in `addons/`, and both
 * are better than this. Neither is vendored, and vendoring them would pull in
 * eight more files and a bloom that blurs across five mip levels — a lot of
 * fill rate for a project whose whole performance story is "stop shading so
 * many fragments". So: four fullscreen passes, three of them at quarter
 * resolution.
 *
 * The important property is that this works on the *tone-mapped* image rather
 * than in linear light. Physically that is the wrong place to bloom, and it
 * costs some highlight energy. In exchange the pass is colour-neutral by
 * construction: the scene is rendered to a target in exactly the colour space
 * it would have gone to the canvas in, and at strength 0 with no vignette the
 * composite hands those pixels straight back. Nothing here can shift the look
 * of the game unless it is doing so on purpose.
 *
 * The emissive things this exists for — LEDs, screens, exit signs, the torch —
 * are all `toneMapped: false` and sit near white, so they clear the threshold
 * comfortably even without the headroom above 1.0 that an HDR buffer keeps.
 */

const BLOOM_DIVISOR = 4;

/** Passes over the whole frame, for the budget in tools/perf-check.mjs. */
export const POST_PASSES = 4;

const VERTEX = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Everything below reads and writes sRGB-encoded values deliberately — see the
// note above. No colour space conversion happens anywhere in this file.
const BRIGHT = `
  uniform sampler2D tSrc;
  uniform float uThreshold;
  uniform float uSoft;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tSrc, vUv).rgb;
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    gl_FragColor = vec4(c * smoothstep(uThreshold, uThreshold + uSoft, lum), 1.0);
  }
`;

// separable 9-tap gaussian, run once across and once down
const BLUR = `
  uniform sampler2D tSrc;
  uniform vec2 uDir;
  varying vec2 vUv;
  void main() {
    vec3 sum = texture2D(tSrc, vUv).rgb * 0.2270270270;
    sum += (texture2D(tSrc, vUv + uDir * 1.3846153846).rgb
          + texture2D(tSrc, vUv - uDir * 1.3846153846).rgb) * 0.3162162162;
    sum += (texture2D(tSrc, vUv + uDir * 3.2307692308).rgb
          + texture2D(tSrc, vUv - uDir * 3.2307692308).rgb) * 0.0702702703;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

const COMPOSITE = `
  uniform sampler2D tScene;
  uniform sampler2D tBloom;
  uniform float uStrength;
  uniform float uVignette;
  varying vec2 vUv;
  void main() {
    vec3 base = texture2D(tScene, vUv).rgb;
    vec3 glow = texture2D(tBloom, vUv).rgb;
    vec2 d = vUv - 0.5;
    float edge = 1.0 - uVignette * dot(d, d) * 2.0;
    gl_FragColor = vec4((base + glow * uStrength) * clamp(edge, 0.0, 1.0), 1.0);
  }
`;

/** Day is a lit working hall and wants almost none of this. Night is the point. */
const LOOK = {
  day: { strength: 0.34, threshold: 0.78, vignette: 0.18 },
  night: { strength: 0.62, threshold: 0.62, vignette: 0.42 },
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;
    this.look = LOOK.day;
    this._size = new THREE.Vector2();

    const target = (depthBuffer) => new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer,
      // exactly what would have gone to the canvas, tone mapping and all
      colorSpace: THREE.SRGBColorSpace,
    });

    // the hall is drawn into this one and still needs depth; the fullscreen
    // passes never do
    this.sceneTarget = target(true);
    this.bloomA = target(false);
    this.bloomB = target(false);

    this.bright = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: BRIGHT,
      uniforms: {
        tSrc: { value: null },
        uThreshold: { value: this.look.threshold },
        uSoft: { value: 0.22 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.blur = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: BLUR,
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
    });
    this.composite = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: COMPOSITE,
      uniforms: {
        tScene: { value: null },
        tBloom: { value: null },
        uStrength: { value: this.look.strength },
        uVignette: { value: this.look.vignette },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite);
    this.quad.frustumCulled = false;
    this.quadScene = new THREE.Scene();
    this.quadScene.add(this.quad);
    this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  setMode(mode) {
    this.look = LOOK[mode] ?? LOOK.day;
    this.bright.uniforms.uThreshold.value = this.look.threshold;
    this.composite.uniforms.uStrength.value = this.look.strength;
    this.composite.uniforms.uVignette.value = this.look.vignette;
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  /**
   * The resolution governor moves the pixel ratio around underneath us, so the
   * targets are sized from the drawing buffer every frame rather than on the
   * resize event.
   */
  _resizeToRenderer() {
    this.renderer.getDrawingBufferSize(this._size);
    const w = Math.max(1, this._size.x);
    const h = Math.max(1, this._size.y);
    if (this.sceneTarget.width === w && this.sceneTarget.height === h) return;
    this.sceneTarget.setSize(w, h);
    const bw = Math.max(1, Math.floor(w / BLOOM_DIVISOR));
    const bh = Math.max(1, Math.floor(h / BLOOM_DIVISOR));
    this.bloomA.setSize(bw, bh);
    this.bloomB.setSize(bw, bh);
  }

  _pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  render() {
    if (!this.enabled) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this._resizeToRenderer();

    this.renderer.setRenderTarget(this.sceneTarget);
    this.renderer.render(this.scene, this.camera);

    this.bright.uniforms.tSrc.value = this.sceneTarget.texture;
    this._pass(this.bright, this.bloomA);

    const { width, height } = this.bloomA;
    this.blur.uniforms.tSrc.value = this.bloomA.texture;
    this.blur.uniforms.uDir.value.set(1 / width, 0);
    this._pass(this.blur, this.bloomB);

    this.blur.uniforms.tSrc.value = this.bloomB.texture;
    this.blur.uniforms.uDir.value.set(0, 1 / height);
    this._pass(this.blur, this.bloomA);

    this.composite.uniforms.tScene.value = this.sceneTarget.texture;
    this.composite.uniforms.tBloom.value = this.bloomA.texture;
    this._pass(this.composite, null);
  }

  dispose() {
    for (const t of [this.sceneTarget, this.bloomA, this.bloomB]) t.dispose();
    for (const m of [this.bright, this.blur, this.composite]) m.dispose();
    this.quad.geometry.dispose();
  }
}
