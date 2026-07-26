/**
 * Headless smoke test. Builds the whole hall with a hand-rolled DOM stub (no
 * WebGL, no browser), runs a full shift, and fires every interaction it can
 * reach so plain runtime errors surface before anyone opens the page.
 *
 * The HUD is stubbed out — it is pure DOM glue; everything else is real.
 * Run with: npm test
 */

// ---- minimal DOM stub ------------------------------------------------------

const ctx2d = new Proxy(
  { canvas: { width: 256, height: 256 } },
  {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => undefined;
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  },
);

const makeElement = (tag) => ({
  tagName: tag,
  width: 256,
  height: 256,
  style: {},
  children: [],
  getContext: () => ctx2d,
  addEventListener() {},
  removeEventListener() {},
  appendChild(child) { this.children.push(child); return child; },
  setAttribute() {},
  requestPointerLock() {},
});

globalThis.document = {
  createElement: makeElement,
  createElementNS: (_ns, tag) => makeElement(tag),
  addEventListener() {},
  dispatchEvent() {},
  getElementById: () => makeElement('div'),
};
globalThis.window = globalThis;
globalThis.self = globalThis;
// node ships a read-only `navigator`; three only reads userAgent off it
if (!globalThis.navigator?.userAgent) {
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' } });
}
globalThis.innerWidth = 1280;
globalThis.innerHeight = 720;
globalThis.devicePixelRatio = 1;
globalThis.addEventListener = () => {};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init) { this.type = type; this.detail = init?.detail; }
};
globalThis.requestAnimationFrame = (cb) => setTimeout(cb, 16);

// ---- build the hall --------------------------------------------------------

const THREE = await import('../vendor/three/three.module.js');
const { buildHall } = await import('../src/world.js');
const { buildRacks, updateRackLeds } = await import('../src/racks.js');
const { buildProps, updateFans } = await import('../src/props.js');
const { Player } = await import('../src/player.js');
const { Game } = await import('../src/game.js');

const noop = () => {};
const hud = {
  say: noop, setStatus: noop, setChecklist: noop, setAlerts: noop,
  setCarry: noop, setStamina: noop, setMarker: noop, setPrompt: noop,
};

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 200);
buildHall(scene);
const racks = buildRacks(scene);
const { stations, fans } = buildProps(scene);
const player = new Player(camera, makeElement('canvas'));
const game = new Game({ scene, camera, player, racks, stations, hud, audio: null });

// ---- run a shift -----------------------------------------------------------

let ran = 0;
let refused = 0;
const seenLabels = new Set();

function tryInteract(target) {
  const action = game.resolveAction(target);
  if (!action) return;
  seenLabels.add(action.label.replace(/[A-F]\d\d|CRAC-\d+|UPS-[A-C]|PDU-\d/g, '#'));
  if (action.disabled) {
    refused++;
    return;
  }
  action.run?.();
  ran++;
}

game.start();

const dt = 1 / 30;
const spares = stations.find((s) => s.kind === 'spares');
const ewaste = stations.find((s) => s.kind === 'ewaste');

for (let step = 0; step < 900 * 30 && game.phase === 'running'; step++) {
  // sweep the player around the hall so proximity triggers fire
  const t = game.time * 0.35;
  player.position.set(Math.sin(t) * 9, 1.68, Math.cos(t * 0.7) * 9.5);

  player.update(dt);
  game.update(dt);
  updateFans(fans, dt);
  updateRackLeds(racks, game.time);

  if (step % 45 === 0) {
    // fetch part -> fix rack -> bin the dead one, then poke everything else
    tryInteract(spares);
    for (const rack of racks) if (rack.fault) tryInteract(rack);
    tryInteract(ewaste);
    for (const s of stations) tryInteract(s);
    tryInteract(racks[Math.floor(Math.random() * racks.length)]);
  }
}

if (game.phase === 'running') game.endShift('clock');
const report = game.report;

console.log(`actions run: ${ran} · prompts refused: ${refused}`);
console.log(`tasks generated: ${game.tasks.length} · hall avg ${game.hallTemp.toFixed(1)}C`);
console.log('report:', JSON.stringify(report));

const fail = (msg) => {
  console.error('SMOKE TEST FAILED:', msg);
  process.exit(1);
};

if (!report) fail('shift never produced a report');
if (report.total < 4) fail('routine checklist was not populated');
if (ran < 20) fail('interactions never resolved to runnable actions');
if (game.tasks.length < 6) fail('no incidents were rolled during the shift');
if (racks.some((r) => Number.isNaN(r.temp))) fail('rack temperature went NaN');
if (Number.isNaN(report.uptime)) fail('uptime went NaN');
console.log(`distinct prompts seen: ${seenLabels.size}`);
console.log('smoke test OK');
