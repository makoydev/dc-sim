/**
 * Samples the hall's lighting at the spots a player actually stands, so a
 * lighting change can be judged without eyeballing a screenshot. Reads the
 * real light plan from world.js, so it cannot drift from the game.
 *
 * Numbers are arbitrary units — only the ratios between spots matter. The
 * equipment walls should land in the same ballpark as the aisles.
 *
 * Run with: npm run lights
 */
import { lightPlan, emergencyPlan, LIGHTING } from '../src/world.js';

// three's punctual falloff with decay = 2
const attenuation = (intensity, d, range) =>
  (intensity / Math.max(d * d, 0.01)) *
  Math.pow(Math.max(0, Math.min(1, 1 - Math.pow(d / range, 4))), 2);

const FILL = LIGHTING.ambient * 0.3 + LIGHTING.hemisphere * 0.2;
const NIGHT_FILL = 0.22 * 0.3 + 0.14 * 0.2;

const lights = lightPlan();

const sampleWith = (plan, fill) => ([px, py, pz]) =>
  plan.reduce(
    (sum, l) => sum + attenuation(l.intensity, Math.hypot(l.x - px, l.y - py, l.z - pz), l.range),
    fill,
  );

const sample = sampleWith(lights, FILL);

const SPOTS = {
  'CRAC face (east wall)': [11.5, 1.5, -7],
  'UPS face (west wall)': [-11.7, 1.5, -2],
  'PDU panel (west wall)': [-12.4, 1.5, -7.4],
  'spares cage (south wall)': [-8.6, 1.4, 9.0],
  'e-waste bin': [-6.0, 0.9, 9.7],
  'NOC desk (north-east)': [8.6, 1.2, -9.4],
  'coffee machine (north-west)': [-11.4, 1.2, -9.6],
  'VESDA panel (north wall)': [-1.5, 1.5, -10.7],
  'centre cold aisle': [0, 1.5, -3.7],
  'rack front, row C': [0, 1.5, -2.2],
  'hot aisle A/B': [-3.5, 1.5, -7.05],
  'far corner floor': [-12, 0.1, 10],
};

const values = Object.entries(SPOTS).map(([name, p]) => [name, sample(p)]);
const level = values.map(([, v]) => v);
const min = Math.min(...level);
const max = Math.max(...level);

console.log(`${lights.length} punctual lights · fill ${FILL.toFixed(2)}\n`);
for (const [name, value] of values) {
  const bar = '█'.repeat(Math.round((value / max) * 28));
  console.log(`${name.padEnd(28)}${value.toFixed(2).padStart(6)}  ${bar}`);
}
console.log(`\ndarkest ${min.toFixed(2)} · brightest ${max.toFixed(2)} · ratio ${(max / min).toFixed(1)}x`);

// A hall where one working area is many times darker than another reads as
// broken rather than moody. 4x is roughly where it started to look like a cave.
if (max / min > 4) {
  console.error('\nFAIL: lighting is too uneven across working areas');
  process.exit(1);
}
console.log('lighting spread OK');

// ---- night: the bank draining -----------------------------------------------
// The emergency rig runs off the UPS, so at night the question is not evenness
// but how dark it gets and how fast. Sampled at the walk you actually do.

const NIGHT_SPOTS = {
  'centre cold aisle': [0, 1.5, -3.7],
  'UPS face (west wall)': [-11.7, 1.5, -2],
  'CRAC face (east wall)': [11.5, 1.5, -7],
  'far corner floor': [-12, 0.1, 10],
};

console.log('\nemergency lighting as the bank drains\n');
const header = Object.keys(NIGHT_SPOTS).map((n) => n.slice(0, 13).padStart(14)).join('');
console.log(`${'reserve'.padEnd(9)}${'lit'.padEnd(5)}${header}`);

const totalAt = (reserve) => {
  const at = sampleWith(emergencyPlan(reserve), NIGHT_FILL);
  return Object.values(NIGHT_SPOTS).reduce((sum, p) => sum + at(p), 0);
};

for (const reserve of [1, 0.8, 0.6, 0.45, 0.3, 0.15, 0]) {
  const plan = emergencyPlan(reserve);
  const at = sampleWith(plan, NIGHT_FILL);
  const cells = Object.values(NIGHT_SPOTS)
    .map((p) => at(p).toFixed(2).padStart(14))
    .join('');
  console.log(`${reserve.toFixed(2).padEnd(9)}${String(plan.length).padEnd(5)}${cells}`);
}

// same spots, both ends of the bank — how much light the night actually loses
const drop = totalAt(1) / totalAt(0);
const flat = sampleWith(emergencyPlan(0), NIGHT_FILL);
const darkest = Math.min(...Object.values(NIGHT_SPOTS).map(flat));
console.log(`\nacross these spots a flat bank is ${drop.toFixed(1)}x darker than a full one`);

// It has to actually go dark — that is the mechanic — but never to nothing, or
// there is no reading the hall at all and the exit signs stop meaning anything.
if (drop < 3) {
  console.error('\nFAIL: a flat bank is barely darker than a full one');
  process.exit(1);
}
if (darkest <= 0) {
  console.error('\nFAIL: a flat bank leaves the hall pitch black');
  process.exit(1);
}
console.log('emergency drain OK');
