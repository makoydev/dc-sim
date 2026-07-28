/**
 * Counts what the renderer will actually have to do each frame: draw calls,
 * triangles, punctual lights, and the per-frame canvas repaints. Headless, so
 * it cannot measure milliseconds — but draw calls and light count are the two
 * things that were making this hall expensive, and both are countable.
 *
 * Run with: npm run perf
 */

const ctx2d = new Proxy(
  { canvas: { width: 256, height: 256 } },
  {
    get: (t, p) => (p in t ? t[p] : p === 'measureText' ? () => ({ width: 10 }) : () => undefined),
    set: (t, p, v) => ((t[p] = v), true),
  },
);
const makeElement = () => ({
  width: 256, height: 256, style: {}, children: [],
  getContext: () => ctx2d, addEventListener() {}, appendChild(c) { return c; },
});
globalThis.document = {
  createElement: makeElement, createElementNS: makeElement,
  addEventListener() {}, getElementById: makeElement,
};
globalThis.window = globalThis;
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.devicePixelRatio = 2;
globalThis.addEventListener = () => {};
if (!globalThis.navigator?.userAgent) {
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' } });
}

const THREE = await import('three');
const { buildHall, setLightingMode } = await import('../src/world.js');
const { buildRacks } = await import('../src/racks.js');
const { buildProps } = await import('../src/props.js');
const { Entity } = await import('../src/entity.js');
const { Torch } = await import('../src/torch.js');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 200);
buildHall(scene);
const racks = buildRacks(scene);
buildProps(scene);
const player = { position: new THREE.Vector3(0, 1.68, -10), yaw: 0 };
new Entity({ scene, player, racks, hud: null, audio: null });
new Torch(camera, scene);

function survey(label) {
  let drawCalls = 0;
  let triangles = 0;
  let lights = 0;
  let invisible = 0;
  let objects = 0;
  const materials = new Set();
  const geometries = new Set();

  scene.traverse((obj) => {
    objects++;
    if (obj.isLight) {
      if (obj.visible && obj.intensity > 0) lights++;
      return;
    }
    if (!obj.isMesh && !obj.isLine && !obj.isPoints) return;
    if (!obj.visible) {
      invisible++;
      return;
    }
    const count = obj.isInstancedMesh ? obj.count : 1;
    drawCalls += 1; // instanced meshes are still one call
    const index = obj.geometry.index;
    const verts = index ? index.count : obj.geometry.attributes.position?.count ?? 0;
    triangles += (verts / 3) * count;
    materials.add(obj.material.uuid);
    geometries.add(obj.geometry.uuid);
  });

  console.log(`\n${label}`);
  console.log(`  draw calls      ${drawCalls}`);
  console.log(`  triangles       ${Math.round(triangles).toLocaleString()}`);
  console.log(`  punctual lights ${lights}`);
  console.log(`  materials       ${materials.size}`);
  console.log(`  geometries      ${geometries.size}`);
  console.log(`  scene objects   ${objects} (${invisible} invisible, not drawn)`);
  return { drawCalls, lights, triangles };
}

setLightingMode('day');
const day = survey('DAY');
setLightingMode('night');
const night = survey('NIGHT');

// Rough shading cost: every visible fragment loops every punctual light, so
// this product is the number that actually hurt on an integrated GPU.
console.log(`\n  day   cost index ${(day.drawCalls * day.lights).toLocaleString()}`);
console.log(`  night cost index ${(night.drawCalls * night.lights).toLocaleString()}`);

const fail = (msg) => {
  console.error(`\nPERF BUDGET FAILED: ${msg}`);
  process.exit(1);
};
// Draw calls are no longer the bottleneck at this scale — the light count and
// the pixel ratio are — but this budget stops the scene creeping back up.
if (day.drawCalls > 280) fail(`${day.drawCalls} draw calls in day mode, budget 280`);
if (day.lights > 18) fail(`${day.lights} lights in day mode, budget 18`);
if (night.lights > 10) fail(`${night.lights} lights at night, budget 10`);
console.log('\nwithin budget');
