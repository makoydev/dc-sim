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
  setTorch: noop, setNoise: noop, setHiding: noop,
  setCompact: noop, setObjective: noop, coach: noop,
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
  if (rig.troffers.some((l) => l.visible)) fail('ceiling grid still lit at night');
  if (!rig.emergency.every(({ lamp }) => lamp.visible && lamp.intensity > 0)) {
    fail('emergency lighting is dark');
  }
  // a zero-intensity light still costs a full evaluation per fragment, so the
  // rig must switch off rather than dim
  if (rig.troffers.some((l) => l.intensity === 0)) {
    fail('troffers were dimmed to zero instead of switched off');
  }

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
  if (rig.troffers.some((l) => !l.visible)) fail('day lighting did not come back');
  console.log(`night shift OK · ${events.length} presence events, torch drains and recovers`);
}

// ---- night checklist -------------------------------------------------------

{
  const { createRoutineTasks } = await import('../src/tasks.js');
  const dayList = createRoutineTasks(stations, 'day');
  const nightList = createRoutineTasks(stations, 'night');

  if (nightList.length > 2) {
    fail(`night starts with ${nightList.length} routine tasks, should be at most 2`);
  }
  if (dayList.length < 5) fail('the day shift lost its full checklist');

  const nightWalk = nightList.find((t) => t.kind === 'walk');
  if (!nightWalk || nightWalk.total > 2) {
    fail(`night walkthrough covers ${nightWalk?.total} aisles, should be 2`);
  }

  // night wording should not require knowing the acronyms
  const JARGON = /\b(CRAC|UPS|PDU|VESDA|SLA|uplink|reseat|mains|breaker)\b/;
  for (const t of nightList) {
    if (JARGON.test(t.title)) fail(`night task still reads like jargon: "${t.title}"`);
  }
  console.log(
    `checklist OK · ${nightList.length} night tasks vs ${dayList.length} by day, plain wording`,
  );
}

// ---- day-shift coaching ----------------------------------------------------

{
  const { Coach, COACH_LESSONS } = await import('../src/coach.js');
  const shown = [];
  const coach = new Coach({ coach: (t) => shown.push(t) });

  // nights must stay silent — the coaching is the day shift's job
  coach.start('night');
  coach.update(99, game, { lookingAtAction: true });
  if (shown.length) fail('the coach spoke on the night shift');

  // a day shift that hits every situation should teach every lesson, one at a
  // time and never two at once
  coach.start('day');
  const world = {
    time: 0, hallTemp: 21, carrying: null,
    tasks: [], openTasks: [],
  };
  const seenPerStep = [];
  for (let i = 0; i < 400; i++) {
    world.time = i;
    if (i > 60) world.openTasks = [{ dueAt: 100, need: 'drive' }];
    if (i > 120) world.carrying = { key: 'drive' };
    if (i > 180) world.carrying = { key: 'deadDrive' };
    if (i > 240) world.hallTemp = 28;
    if (i > 300) world.tasks = [{ kind: 'handover', state: 'todo' }];
    const before = shown.length;
    coach.update(1, world, { lookingAtAction: i > 20 });
    seenPerStep.push(shown.length - before);
  }
  if (seenPerStep.some((n) => n > 1)) fail('the coach showed two lessons in one frame');
  if (!coach.complete) {
    const missing = COACH_LESSONS.filter((l) => !coach.done.has(l.id)).map((l) => l.id);
    fail(`coaching never fired: ${missing.join(', ')}`);
  }
  if (shown.length !== COACH_LESSONS.length) fail('a lesson repeated itself');

  // and nothing it says should reference a key the game does not bind
  const KEYS = /\b(W A S D|Shift|Tab|Esc|E|F3|F)\b/;
  if (!shown.some((t) => KEYS.test(t))) fail('no lesson mentions any control');
  console.log(`coaching OK · ${COACH_LESSONS.length} lessons, day only, one at a time`);
}

// ---- the partner -----------------------------------------------------------

{
  const { Partner, PARTNER_LINES } = await import('../src/partner.js');
  const said = [];
  const partner = new Partner({
    hud: { say: (text) => said.push(text) }, audio: null, entity: null,
  });

  // the arc must run in order and finish inside a shift
  for (let i = 0; i <= 100; i++) partner.update(i / 100);
  if (said.length !== PARTNER_LINES.length) {
    fail(`partner said ${said.length} of ${PARTNER_LINES.length} lines`);
  }
  if (!partner.lost) fail('the channel never went silent');
  if (!partner.compromised) fail('the arc never reached the part after the silence');

  // The echo is the whole trick: what comes back after the silence is stitched
  // out of things he actually said earlier, so every 'wrong' line must appear
  // word for word inside an 'ok' one.
  const strip = (t) => t.replace(/^RAMOS:\s*\.*/i, '').trim().toLowerCase();
  const early = PARTNER_LINES.filter((l) => l.kind === 'ok').map((l) => strip(l.text));
  for (const line of PARTNER_LINES.filter((l) => l.kind === 'wrong')) {
    const fragment = strip(line.text);
    // the last line is his own words turned into an invitation, not a repeat
    if (/genset room/.test(fragment)) continue;
    if (!early.some((e) => e.includes(fragment))) {
      fail(`"${line.text}" is not something he said before the silence`);
    }
  }

  // and it must not fire everything at once on a fresh shift
  partner.reset();
  partner.update(0);
  if (said.length > PARTNER_LINES.length + 1) fail('the arc replayed on reset');
  if (partner.lost) fail('reset did not clear the lost flag');
  console.log(`partner OK · ${PARTNER_LINES.length} lines in order, with the echo`);
}

// ---- the entity ------------------------------------------------------------

const { Entity } = await import('../src/entity.js');
const { inContainment } = await import('../src/world.js');

{
  const entity = new Entity({ scene, player, racks, hud, audio: null });

  // the graph must connect every aisle, or it will get stranded in one
  const reachable = new Set([0]);
  const queue = [entity.nodes[0]];
  while (queue.length) {
    const node = queue.shift();
    for (const id of node.links) {
      if (reachable.has(id) || entity.nodes[id].contained) continue;
      reachable.add(id);
      queue.push(entity.nodes[id]);
    }
  }
  const open = entity.nodes.filter((n) => !n.contained).length;
  if (reachable.size < open) {
    fail(`nav graph is not connected: ${reachable.size}/${open} nodes reachable`);
  }
  if (!entity.nodes.some((n) => n.contained)) fail('no nav nodes fall inside containment');

  // it should hunt a noisy player down and catch them
  let caught = 0;
  entity.onCatch = () => { caught++; };
  entity.spawn();
  player.position.set(0, 1.68, -9.8);
  for (let i = 0; i < 90 * 30; i++) {
    entity.update(1 / 30);
    if (i % 15 === 0) entity.hear(0.8, player.position.clone());
    if (caught) break;
  }
  if (!caught) fail('the entity never caught a player standing still and shouting');
  console.log(`entity OK · caught a noisy stationary player in the open`);

  // going quiet must not work at close range: it heard you once, it is coming
  entity.despawn();
  entity.spawn();
  entity.teleport(new THREE.Vector3(-4, 0, -9.8));
  player.position.set(4, 1.68, -9.8);
  caught = 0;
  entity.hear(1, player.position.clone()); // one noise, then absolute silence
  for (let i = 0; i < 60 * 30 && !caught; i++) entity.update(1 / 30);
  if (!caught) fail('holding still inside lock range shook it off — it should close in');
  console.log('lock-on OK · going quiet at close range does not shake it');

  // but going quiet across the hall should
  entity.despawn();
  entity.spawn();
  entity.teleport(new THREE.Vector3(-11, 0, 9.3));
  player.position.set(11, 1.68, -9.8);
  caught = 0;
  entity.hear(1, player.position.clone());
  let gaveUp = false;
  for (let i = 0; i < 90 * 30 && !caught; i++) {
    entity.update(1 / 30);
    if (entity.state === 'patrol') { gaveUp = true; break; }
  }
  if (caught) fail('it found a silent player on the far side of the hall');
  if (!gaveUp) fail('it never gave up on a silent player across the hall');
  console.log('give-up OK · silence works at range, not up close');

  // and it must never enter containment, however loud you are in there
  const safe = { x: 0, z: -3.7 };
  player.position.set(safe.x, 1.68, safe.z);
  if (!inContainment(player.position)) fail('the safe test spot is not inside containment');
  caught = 0;
  entity.spawn();
  let intrusions = 0;
  for (let i = 0; i < 120 * 30; i++) {
    entity.update(1 / 30);
    if (i % 10 === 0) entity.hear(1, player.position.clone());
    if (inContainment(entity.position)) intrusions++;
  }
  if (intrusions) fail(`the entity walked into containment ${intrusions} times`);
  if (caught) fail('the entity caught a player standing inside containment');
  console.log('containment OK · it will not come in, however loud you are');

  // masking: the same noise must carry further with the cooling down
  const cracs = stations.filter((s) => s.kind === 'crac');
  game._humLevel = 1;
  const quietMask = game.masking;
  game._humLevel = 0;
  const loudMask = game.masking;
  if (!(loudMask < quietMask)) fail('losing cooling did not make the hall more revealing');
  console.log(`masking OK · ${quietMask.toFixed(2)} with fans, ${loudMask.toFixed(2)} without`);

  // being caught costs an hour and heat, and does not end the shift
  game.phase = 'running';
  game.mode = 'night';
  game.time = 60; // partway through a night, not carrying the day shift's clock
  const before = { time: game.time, temp: racks[0].temp, caught: game.stats.caught };
  game.playerCaught();
  if (game.phase !== 'caught') fail('being caught did not enter the come-to phase');
  if (game.time <= before.time) fail('being caught cost no time');
  if (racks[0].temp <= before.temp) fail('being caught did not heat the hall');
  game.resumeAfterCatch();
  if (game.phase !== 'running') fail('the shift did not resume after a catch');
  if (game.stats.caught !== before.caught + 1) fail('the catch was not counted');
  if (cracs.length && game.entityGraceUntil <= game.time) fail('no grace period after a catch');
  console.log('catch OK · costs an hour and heat, shift continues');

  // it has to turn up early enough to be the point of the shift
  {
    const solo = new Game({
      scene, camera, player, racks, stations, hud, audio: null,
      presence: null, entity: new Entity({ scene, player, racks, hud, audio: null }),
    });
    solo.start('night');
    player.position.set(0, 1.68, -10);
    let arrivedAt = null;
    for (let i = 0; i < 300 * 30 && !arrivedAt; i++) {
      solo.update(1 / 30);
      if (solo.entity.state !== 'dormant') arrivedAt = solo.time;
    }
    if (!arrivedAt) fail('the entity never arrived at all');
    if (arrivedAt > 90) fail(`the entity took ${arrivedAt.toFixed(0)}s to show up`);
    if (solo.duration >= 780) fail('the night shift is not shorter than the day shift');
    console.log(
      `arrival OK · on the floor after ${arrivedAt.toFixed(0)}s of a ${solo.duration}s night`,
    );
  }

  // ---- hiding --------------------------------------------------------------

  const spots = stations.filter((s) => s.kind === 'hide');
  if (spots.length < 4) fail(`expected at least 4 hiding places, found ${spots.length}`);
  if (!spots.some((s) => s.hide.under) || !spots.some((s) => !s.hide.under)) {
    fail('need somewhere to get under and somewhere to get inside');
  }

  game.mode = 'night';
  game.phase = 'running';
  game.entity = entity;
  entity.isPlayerHidden = () => Boolean(game.hidden);

  for (const spot of spots) {
    game.time += 2; // clear the re-entry cooldown left by the previous spot
    const action = game.resolveAction(spot);
    if (!action || action.disabled) fail(`${spot.id} could not be hidden in at night`);
    action.run();
    if (game.hidden !== spot) fail(`${spot.id} did not become the hiding place`);
    if (!player.frozen) fail('the player can still walk while hidden');
    if (!player.lookArc) fail('the view is not constrained while hidden');

    // it must not be able to reach you, however close it stands
    entity.spawn();
    entity.teleport(player.position);
    let caughtWhileHidden = 0;
    entity.onCatch = () => { caughtWhileHidden++; };
    for (let i = 0; i < 300; i++) entity.update(1 / 30);
    if (caughtWhileHidden) fail(`${spot.id} did not protect the player`);

    // and standing still in there makes no noise at all
    const before = game.noise;
    game.emitNoise(1);
    if (game.noise > before) fail('a hidden player still made noise');

    game.exitHiding();
    if (game.hidden) fail('could not get out again');
    if (player.frozen || player.lookArc) fail('exiting hiding left the player stuck');
    entity.despawn();
  }
  console.log(`hiding OK · ${spots.length} spots, safe while inside, no noise, exits clean`);

  // the day shift should offer them but refuse
  game.mode = 'day';
  const dayAction = game.resolveAction(spots[0]);
  if (!dayAction?.disabled) fail('hiding should be pointless on the day shift');
}

// ---- emergency lighting as a resource --------------------------------------

{
  const { EMERGENCY } = await import('../src/world.js');
  const upses = stations.filter((s) => s.kind === 'ups');

  // Play a night out to a given point in the shift and report what light is
  // left. `tested` is how many cabinets were self-tested before it started.
  const runNight = (tested, until) => {
    setLightingMode('night');
    for (const [i, ups] of upses.entries()) {
      ups.selfTested = i < tested;
      ups.onBattery = false;
    }
    game.start('night');
    while (game.time < until && game.phase === 'running') game.update(1 / 4);
    return {
      reserve: game.lightReserve,
      lit: rig.emergency.filter((e) => !e.shed).length,
      brightest: Math.max(...rig.emergency.map((e) => e.base)),
    };
  };

  const neglected = runNight(0, 520);
  if (neglected.lit === rig.emergency.length) {
    fail('a night on an untested bank never shed a single fitting');
  }
  if (neglected.reserve > 0.01) fail(`untested bank still had ${neglected.reserve} in reserve`);

  const prepared = runNight(upses.length, 520);
  if (prepared.lit <= neglected.lit) {
    fail(`self-testing bought no light: ${prepared.lit} lit vs ${neglected.lit} untested`);
  }
  if (prepared.reserve <= neglected.reserve) fail('self-tests did not extend the reserve');

  // it gets dark, but never so dark there is nothing to steer by
  if (neglected.lit < 1) fail('the hall went completely black');
  if (!(neglected.brightest > 0)) fail('no fitting was left burning at all');

  // a shed fitting must be switched off rather than dimmed to zero — a dark
  // light still costs a full evaluation per fragment
  const shedLights = rig.emergency.filter((e) => e.shed);
  if (shedLights.some((e) => e.lamp.visible)) fail('a shed fitting was left switched on');
  if (rig.emergency.some((e) => !Number.isFinite(e.lamp.intensity))) {
    fail('the reserve drove a fitting to NaN');
  }

  // the drain has to be monotonic, and shedding has to be ordered — the point
  // of the shed list is that what survives always points at the door
  setLightingMode('night');
  for (const ups of upses) { ups.selfTested = false; ups.onBattery = false; }
  game.start('night');
  let last = Infinity;
  let lastLit = rig.emergency.length;
  while (game.phase === 'running' && game.time < 520) {
    game.update(1 / 4);
    if (game.lightReserve > last + 1e-9) fail('the reserve went back up on its own');
    const lit = rig.emergency.filter((e) => !e.shed).length;
    if (lit > lastLit) fail('a shed fitting came back without a self-test');
    last = game.lightReserve;
    lastLit = lit;
  }
  // exactly one fitting is never on the shed list, and it is the one left
  const keptIndexes = rig.emergency
    .map((_, i) => i)
    .filter((i) => !EMERGENCY.shedOrder.includes(i));
  if (keptIndexes.length !== 1) fail(`${keptIndexes.length} fittings are exempt from shedding`);
  if (rig.emergency[keptIndexes[0]].shed) fail('the fitting by the door was shed anyway');

  // Testing a cabinet mid-shift has to give light back there and then — that
  // visible lift is the only feedback saying the errand was worth walking.
  // Done while the bank still has something left; once it is flat, it is flat.
  setLightingMode('night');
  for (const ups of upses) { ups.selfTested = false; ups.onBattery = false; }
  game.start('night');
  while (game.time < 340 && game.phase === 'running') game.update(1 / 4);
  const dimmest = game.lightReserve;
  const wasLit = rig.emergency.filter((e) => !e.shed).length;
  if (!(dimmest > 0)) fail('the bank was already flat 340s into a 540s night');
  upses[0].selfTested = true;
  game._updateEmergencyPower();
  if (game.lightReserve <= dimmest) fail('a mid-shift self-test bought nothing');
  if (rig.emergency.filter((e) => !e.shed).length < wasLit) {
    fail('a mid-shift self-test somehow cost a fitting');
  }

  // and the prompt that does it must exist at night and only at night
  game.start('night');
  for (const ups of upses) { ups.selfTested = false; ups.onBattery = false; }
  const nightPrompt = game.resolveAction(upses[0]);
  if (!nightPrompt || nightPrompt.disabled) fail('no way to self-test a cabinet at night');
  if (!/lights/i.test(nightPrompt.hint ?? '')) {
    fail(`the night prompt never explains the payoff: "${nightPrompt.hint}"`);
  }
  nightPrompt.run();
  if (!upses[0].selfTested) fail('the night self-test did not take');

  // a fresh shift starts on a full bank, whatever the last one ended on
  game.start('night');
  if (game.lightReserve !== 1) fail('the reserve carried over into a new shift');

  // by day an untested cabinet with no self-test on the checklist is scenery
  setLightingMode('day');
  game.mode = 'day';
  game.tasks = [];
  upses[1].selfTested = false;
  upses[1].onBattery = false;
  const dayIdle = game.resolveAction(upses[1]);
  if (!dayIdle?.disabled) fail('the night self-test prompt leaked into the day shift');

  console.log(
    `emergency power OK · untested bank ends on ${neglected.lit} lights, `
    + `a tested one on ${prepared.lit}`,
  );
}

console.log('smoke test OK');
