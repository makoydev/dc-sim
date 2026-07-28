import * as THREE from 'three';
import { buildHall, setLightingMode } from './world.js';
import { buildRacks, updateRackLeds } from './racks.js';
import { Player } from './player.js';
import { buildProps, updateFans } from './props.js';
import { Interaction } from './interaction.js';
import { Highlighter } from './highlight.js';
import { HUD } from './ui.js';
import { Audio } from './audio.js';
import { Game } from './game.js';
import { Torch } from './torch.js';
import { Presence } from './presence.js';

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.14;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070a);
// haze rather than blackness — the old fog started eating the far corners
scene.fog = new THREE.Fog(0x0a121a, 26, 80);

const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 200);
camera.position.set(0, 1.7, 6);

buildHall(scene);
const racks = buildRacks(scene);
const { stations, fans } = buildProps(scene);
const player = new Player(camera, canvas);

const hud = new HUD(document.getElementById('ui'));
const audio = new Audio();
const torch = new Torch(camera, scene);
const presence = new Presence({ camera, player, racks, hud, audio });
const game = new Game({ scene, camera, player, racks, stations, hud, audio, presence });
const interaction = new Interaction(camera, scene, (target) => game.resolveAction(target));
const highlighter = new Highlighter(scene);

player.onFootstep = (sprinting) => audio.footstep(sprinting);

function resize() {
  const w = innerWidth;
  const h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

// ---- overlays --------------------------------------------------------------

const CONTROLS = `
  <div class="keys">
    <b>W A S D</b><span>walk the aisles</span>
    <b>Mouse</b><span>look around</span>
    <b>Shift</b><span>sprint (costs stamina)</span>
    <b>E</b><span>interact — hold for longer jobs</span>
    <b>F</b><span>torch (nights only — the battery is finite)</span>
    <b>Tab</b><span>show / hide the checklist</span>
    <b>Esc</b><span>pause</span>
  </div>`;

function beginShift(mode) {
  hud.hideOverlay();
  audio.resume();
  setLightingMode(mode);
  scene.fog = mode === 'night'
    ? new THREE.Fog(0x03050a, 6, 34)
    : new THREE.Fog(0x0a121a, 26, 80);
  renderer.toneMappingExposure = mode === 'night' ? 1.0 : 1.14;
  torch.on = mode === 'night';
  game.start(mode);
  canvas.requestPointerLock();
}

function showBriefing() {
  hud.showOverlay(
    `<h1>Uptime</h1>
     <h2>Data hall 3 &middot; pick your shift</h2>
     <p>You are the engineer on the floor. Work the checklist, answer the tickets
     that page you during the shift, and keep the SLA above 99.9%.</p>
     <p class="dim">Failed drives, clogged filters and tripped breakers all cost
     uptime while they sit open. Parts live in the spares cage; dead hardware
     goes in the e-waste bin.</p>
     ${CONTROLS}
     <div class="choices">
       <button id="day">Day shift &middot; 08:00</button>
       <button id="night" class="ghost">Night shift &middot; 22:00</button>
     </div>
     <p class="dim small">Nights: the hall runs on emergency lighting and you
     work by torch. Ramos is on the genset walk. He will not be answering.</p>`,
    (root) => {
      root.querySelector('#day').addEventListener('click', () => beginShift('day'));
      root.querySelector('#night').addEventListener('click', () => beginShift('night'));
    },
  );
}

function showPause() {
  hud.showOverlay(
    `<h1>Paused</h1><h2>The racks are still running without you</h2>${CONTROLS}
     <button id="resume">Back to the floor</button>`,
    (root) => {
      root.querySelector('#resume').addEventListener('click', () => {
        hud.hideOverlay();
        canvas.requestPointerLock();
      });
    },
  );
}

function showReport(report) {
  const line = (label, value, cls = '') =>
    `<div class="scoreline"><span class="dim">${label}</span><span class="${cls}">${value}</span></div>`;
  hud.showOverlay(
    `<h1>Shift Report</h1>
     <h2>${report.reason === 'handover' ? 'Handover filed' : 'Clock ran out'} at ${report.clock}</h2>
     <div class="grade ${report.grade === 'D' ? 'bad' : report.grade === 'S' ? 'ok' : 'accent'}">${report.grade}</div>
     ${line('Checklist', `${report.done}/${report.total}`)}
     ${line('Tickets resolved', report.resolved, 'ok')}
     ${line('SLA breaches', report.missed, report.missed ? 'bad' : 'dim')}
     ${line('Final uptime', `${report.uptime.toFixed(3)}%`, report.uptime > 99.9 ? 'ok' : 'warn')}
     ${line('Score', `${report.score}/100`)}
     <p></p><button id="again">Start another shift</button>`,
    (root) => {
      root.querySelector('#again').addEventListener('click', () => location.reload());
    },
  );
}

document.addEventListener('player-lock', (e) => {
  const locked = e.detail;
  interaction.enabled = locked;
  if (!locked && game.phase === 'running') showPause();
});

addEventListener('keydown', (e) => {
  if (e.code === 'Tab') hud.toggleChecklist();
});

showBriefing();

// ---- main loop -------------------------------------------------------------

const clock = new THREE.Clock();
let reported = false;

function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  const elapsed = clock.elapsedTime;
  const active = game.phase === 'running' && player.locked;

  if (active) {
    player.update(dt);
    interaction.update(dt);
    game.update(dt);
    torch.update(dt, player.velocity.length());
    hud.setTorch(game.mode === 'night' ? torch : null);
  }

  updateFans(fans, dt);
  updateRackLeds(racks, elapsed);

  const focus = active && interaction.action ? interaction.target : null;
  highlighter.setTarget(focus, interaction.action?.disabled);
  highlighter.update(elapsed);
  hud.setPrompt(active ? interaction.action : null, interaction.progress);

  if (game.phase === 'report' && !reported) {
    reported = true;
    document.exitPointerLock();
    showReport(game.report);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
