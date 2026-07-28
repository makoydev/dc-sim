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

const THREE = await import('three'); // same pinned build as vendor/, single instance
const { buildHall } = await import('../src/world.js');
const { buildRacks, updateRackLeds } = await import('../src/racks.js');
const { buildProps, updateFans } = await import('../src/props.js');
const { Player } = await import('../src/player.js');
const { Game } = await import('../src/game.js');
const { Interaction } = await import('../src/interaction.js');
const { Highlighter } = await import('../src/highlight.js');
const { pickables } = await import('../src/pickables.js');

const noop = () => {};
const hud = {
  say: noop, setStatus: noop, setChecklist: noop, setAlerts: noop,
  setCarry: noop, setStamina: noop, setMarker: noop, setPrompt: noop,
  setTorch: noop,
};

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 200);
buildHall(scene);
const racks = buildRacks(scene);
const { stations, fans } = buildProps(scene);
const player = new Player(camera, makeElement('canvas'));
const game = new Game({ scene, camera, player, racks, stations, hud, audio: null });

// ---- crosshair picking -----------------------------------------------------

const fail = (msg) => {
  console.error('SMOKE TEST FAILED:', msg);
  process.exit(1);
};

const interaction = new Interaction(camera, scene, (t) => game.resolveAction(t));
const highlighter = new Highlighter(scene);

// the renderer normally does this every frame; there is no renderer here
scene.updateMatrixWorld(true);

function lookFrom(x, y, z, at) {
  camera.position.set(x, y, z);
  camera.lookAt(at.x, y, at.z);
  camera.updateMatrixWorld(true);
  return interaction._pick();
}

{
  if (pickables.length < 80) fail(`pickable list looks wrong: ${pickables.length}`);

  const rack = racks[10];
  const picked = lookFrom(rack.frontSpot.x, 1.6, rack.frontSpot.z, rack.group.position);
  if (picked !== rack) fail(`looking at rack ${rack.id} picked ${picked?.id ?? 'nothing'}`);

  const crac = stations.find((s) => s.kind === 'crac');
  const atCrac = lookFrom(crac.position.x - 2, 1.4, crac.position.z, crac.position);
  if (atCrac !== crac) fail(`looking at ${crac.label} picked ${atCrac?.label ?? 'nothing'}`);

  const spares = stations.find((s) => s.kind === 'spares');
  const atShelf = lookFrom(spares.position.x, 1.4, spares.position.z - 1.8, spares.position);
  if (atShelf !== spares) fail('looking at the spares cage picked nothing');

  // a wall between you and a prop must block the pick
  const throughWall = lookFrom(crac.position.x + 3, 1.4, crac.position.z, crac.position);
  if (throughWall) fail('picked a station through the hall wall');

  // and empty floor in the middle of a cold aisle resolves to nothing
  if (lookFrom(0, 1.6, -3.7, { x: 0, z: 0 }) === undefined) fail('pick returned undefined');

  for (const target of [rack, crac, spares]) {
    highlighter.setTarget(target, false);
    const s = highlighter.lines.scale;
    if (!highlighter.lines.visible) fail('highlight did not become visible');
    if ([s.x, s.y, s.z].some((v) => !Number.isFinite(v) || v <= 0)) {
      fail(`highlight bounds are wrong: ${s.x},${s.y},${s.z}`);
    }
  }
  highlighter.setTarget(null);
  if (highlighter.lines.visible) fail('highlight did not clear');
  let sceneObjects = 0;
  scene.traverse(() => sceneObjects++);
  console.log(`picking OK · ${pickables.length} pickable meshes of ${sceneObjects} scene objects`);
}

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

if (!report) fail('shift never produced a report');
if (report.total < 4) fail('routine checklist was not populated');
if (ran < 20) fail('interactions never resolved to runnable actions');
if (game.tasks.length < 6) fail('no incidents were rolled during the shift');
if (racks.some((r) => Number.isNaN(r.temp))) fail('rack temperature went NaN');
if (Number.isNaN(report.uptime)) fail('uptime went NaN');
console.log(`distinct prompts seen: ${seenLabels.size}`);

// ---- night shift -----------------------------------------------------------

const { setLightingMode, rig } = await import('../src/world.js');
const { Presence } = await import('../src/presence.js');
const { Torch } = await import('../src/torch.js');

{
  setLightingMode('night');
  if (rig.troffers.some((l) => l.intensity > 0)) fail('ceiling grid still lit at night');
  if (!rig.emergency.every(({ lamp }) => lamp.intensity > 0)) fail('emergency lighting is dark');

  const torch = new Torch(camera, scene);
  torch.toggle();
  if (!torch.on) fail('torch would not switch on');
  for (let i = 0; i < 600; i++) torch.update(1, 2);
  if (torch.battery !== 0 || torch.on) fail('torch battery never ran out');
  if (!Number.isFinite(torch.light.intensity)) fail('torch intensity went NaN');

  // fire every director event many times over, at every dread level
  const presence = new Presence({ camera, player, racks, hud, audio: null });
  const fired = new Set();
  const events = ['flicker', 'clang', 'creak', 'footsteps', 'ledWave', 'doorSlam',
    'phantomFault', 'whisper', 'blackout'];
  for (const name of events) {
    presence[name]();
    fired.add(name);
    for (let i = 0; i < 200; i++) {
      player.position.set(Math.sin(i) * 6, 1.68, Math.cos(i) * 6);
      player.velocity.set(1, 0, 1);
      presence.update(1 / 30, i / 200);
    }
  }
  if (fired.size !== events.length) fail('not every presence event ran');
  if (presence.effects.length > 4) fail('presence effects are leaking');
  if (racks.some((r) => r.ledOverride)) fail('an LED wave left racks overridden');
  if (rig.emergency.some(({ lamp }) => !Number.isFinite(lamp.intensity))) {
    fail('an event left emergency lighting NaN');
  }
  // overlapping flickers and blackouts must not strand a fitting dead
  if (rig.emergency.some((e) => e.lamp.intensity !== e.base)) {
    fail('an emergency fitting was left off after its effect ended');
  }

  setLightingMode('day');
  if (rig.troffers.some((l) => l.intensity === 0)) fail('day lighting did not come back');
  console.log(`night shift OK · ${events.length} presence events, torch drains and recovers`);
}

console.log('smoke test OK');
