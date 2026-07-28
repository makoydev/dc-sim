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
import { lightPlan, LIGHTING } from '../src/world.js';

// three's punctual falloff with decay = 2
const attenuation = (intensity, d, range) =>
  (intensity / Math.max(d * d, 0.01)) *
  Math.pow(Math.max(0, Math.min(1, 1 - Math.pow(d / range, 4))), 2);

const FILL = LIGHTING.ambient * 0.3 + LIGHTING.hemisphere * 0.2;

const lights = lightPlan();

const sample = ([px, py, pz]) =>
  lights.reduce(
    (sum, l) => sum + attenuation(l.intensity, Math.hypot(l.x - px, l.y - py, l.z - pz), l.range),
    FILL,
  );

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
