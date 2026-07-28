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
import { Entity } from './entity.js';

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
const entity = new Entity({ scene, player, racks, hud, audio });
const game = new Game({
  scene, camera, player, racks, stations, hud, audio, presence, entity,
});
const interaction = new Interaction(camera, scene, (target) => game.resolveAction(target));
const highlighter = new Highlighter(scene);

player.onFootstep = (sprinting) => {
  audio.footstep(sprinting);
  // your own feet are the loudest thing you control
  game.emitNoise(sprinting ? 1 : 0.42);
};

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

// pointer lock and WASD need a real keyboard and mouse; say so up front
// rather than letting a phone load 2 MB and then do nothing
const touchOnly = matchMedia('(pointer: coarse)').matches;

function showBriefing() {
  hud.showOverlay(
    `<h1>Uptime</h1>
     <h2>Data hall 3 &middot; pick your shift</h2>
     ${touchOnly ? '<p class="bad">This one needs a keyboard and mouse — open it on a laptop or desktop.</p>' : ''}
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
     work by torch. Sound carries — the fans cover you, while they are running.
     Ramos is on the genset walk. He will not be answering.</p>`,
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
     ${report.mode === 'night'
       ? line('Hours you cannot account for', report.caught, report.caught ? 'bad' : 'dim')
       : ''}
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
  // while hidden the crosshair is useless, so E is wired straight to getting out
  if (e.code === 'KeyE' && !e.repeat && game.hidden) game.exitHiding();
});

showBriefing();

// ---- main loop -------------------------------------------------------------

const clock = new THREE.Clock();
let reported = false;
let workNoise = 0;
let comeToAt = 0;
let relockBy = 0;

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
    hud.setNoise(game.mode === 'night' ? game.noise : null);

    // hardware work rattles: holding E is a commitment, not a free action
    if (interaction.holding && interaction.action && !interaction.action.disabled) {
      workNoise += dt;
      if (workNoise > 0.45) {
        workNoise = 0;
        game.emitNoise(0.75);
      }
    }
  }

  updateFans(fans, dt);
  updateRackLeds(racks, elapsed);

  const hiding = Boolean(game.hidden);
  interaction.enabled = active && !hiding;
  hud.setHiding(hiding);

  const focus = active && interaction.action ? interaction.target : null;
  highlighter.setTarget(hiding ? null : focus, interaction.action?.disabled);
  highlighter.update(elapsed);
  hud.setPrompt(
    hiding
      ? { label: 'Come out', hint: 'E' }
      : active ? interaction.action : null,
    interaction.progress,
  );

  if (game.phase === 'caught' && !comeToAt) {
    comeToAt = elapsed + 5;
    document.exitPointerLock();
    torch.battery = Math.max(0, torch.battery - 0.25);
    hud.showOverlay(
      `<h1 class="bad">&mdash;</h1>
       <h2>You do not remember the floor coming up</h2>
       <p class="dim">An hour of the shift is gone. The hall is warmer than you
       left it, and whatever you were carrying is not in your hands.</p>`,
    );
  }
  if (comeToAt && elapsed > comeToAt) {
    comeToAt = 0;
    relockBy = elapsed + 1.2;
    hud.hideOverlay();
    game.resumeAfterCatch();
    canvas.requestPointerLock();
  }
  // if the browser refuses the re-lock, fall back to the pause card's button
  if (relockBy && elapsed > relockBy) {
    relockBy = 0;
    if (!player.locked) showPause();
  }

  if (game.phase === 'report' && !reported) {
    reported = true;
    document.exitPointerLock();
    showReport(game.report);
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
