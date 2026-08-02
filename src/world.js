import * as THREE from 'three';
import { floorTexture, wallTexture } from './textures.js';
import { registerPickable } from './pickables.js';

export const HALL = { minX: -13, maxX: 13, minZ: -11, maxZ: 11, height: 4.2 };

/**
 * The tape archive, through the south wall. A room the day shift never opens —
 * there is no cooling in it, which is the whole point: the fan wall that covers
 * your noise everywhere else does not reach in here.
 */
export const TAPE_LIBRARY = { minX: 2.5, maxX: 10.7, minZ: 11.4, maxZ: 17.6, height: 3.0 };

/** The gap in the south wall, and the only way in or out of the archive. */
export const TAPE_DOOR = { minX: 5.4, maxX: 7.8 };

export function inTapeLibrary(position) {
  return position.z > HALL.maxZ
    && position.x > TAPE_LIBRARY.minX
    && position.x < TAPE_LIBRARY.maxX;
}

/** Axis-aligned boxes the player cannot walk through. */
export const colliders = [];

export function addCollider(cx, cz, sx, sz) {
  const box = {
    minX: cx - sx / 2,
    maxX: cx + sx / 2,
    minZ: cz - sz / 2,
    maxZ: cz + sz / 2,
    open: false,
  };
  colliders.push(box);
  return box;
}

/**
 * Keeps the player inside the building rather than inside one room. Two boxes
 * joined by a gap: which one applies is decided by z, and the doorway strip is
 * the only x where the seam between them is not a wall.
 */
export function clampToRooms(position, pad) {
  const clamp = THREE.MathUtils.clamp;
  const throughDoor = position.x > TAPE_DOOR.minX + pad
    && position.x < TAPE_DOOR.maxX - pad;

  if (position.z > HALL.maxZ) {
    position.x = clamp(position.x, TAPE_LIBRARY.minX + pad, TAPE_LIBRARY.maxX - pad);
    position.z = clamp(
      position.z,
      throughDoor ? HALL.minZ + pad : TAPE_LIBRARY.minZ + pad,
      TAPE_LIBRARY.maxZ - pad,
    );
    return;
  }
  position.x = clamp(position.x, HALL.minX + pad, HALL.maxX - pad);
  position.z = clamp(
    position.z,
    HALL.minZ + pad,
    throughDoor ? TAPE_LIBRARY.maxZ - pad : HALL.maxZ - pad,
  );
}

function wall(scene, mat, w, h, d, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  addCollider(x, z, w, d);
  registerPickable(mesh);
  return mesh;
}

export function buildHall(scene) {
  const { minX, maxX, minZ, maxZ, height } = HALL;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTexture(Math.round(w / 0.6)),
    roughness: 0.75,
    metalness: 0.15,
  });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  scene.add(floor);
  registerPickable(floor);

  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x0b1015, roughness: 1 });
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(cx, height, cz);
  scene.add(ceiling);

  const wallMat = new THREE.MeshStandardMaterial({
    map: wallTexture(Math.round(w / 3), 1),
    roughness: 0.9,
    metalness: 0.05,
  });
  const t = 0.4;
  wall(scene, wallMat, w + t * 2, height, t, cx, height / 2, minZ - t / 2);
  wall(scene, wallMat, t, height, d, minX - t / 2, height / 2, cz);
  wall(scene, wallMat, t, height, d, maxX + t / 2, height / 2, cz);

  // the south wall comes in two pieces, with the archive door between them
  for (const [from, to] of [[minX - t, TAPE_DOOR.minX], [TAPE_DOOR.maxX, maxX + t]]) {
    wall(scene, wallMat, to - from, height, t, (from + to) / 2, height / 2, maxZ + t / 2);
  }

  buildCeilingRig(scene);
  buildContainment(scene);
  buildTapeLibrary(scene, wallMat, floorMat, ceilMat, t);
  buildLighting(scene);
  return { floor, ceiling };
}

/**
 * A low, dead room. Nothing in here is cooled, so nothing in here is loud —
 * see Game#masking, which is where that actually bites.
 */
function buildTapeLibrary(scene, wallMat, floorMat, ceilMat, t) {
  const { minX, maxX, minZ, maxZ, height } = TAPE_LIBRARY;
  const w = maxX - minX;
  const d = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0, cz);
  scene.add(floor);
  registerPickable(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(cx, height, cz);
  scene.add(ceiling);

  wall(scene, wallMat, t, height, d + t * 2, minX - t / 2, height / 2, cz);
  wall(scene, wallMat, t, height, d + t * 2, maxX + t / 2, height / 2, cz);
  wall(scene, wallMat, w + t * 2, height, t, cx, height / 2, maxZ + t / 2);
}

/**
 * The two enclosed cold aisles: roof panels and sliding end doors. Sealing the
 * cold air is the real-world reason they exist; on nights they are also the one
 * place the hall feels closed rather than open.
 */
export const CONTAINMENT = [
  { minX: -5.1, maxX: 5.1, minZ: -5.35, maxZ: -2.15 },
  { minX: -5.1, maxX: 5.1, minZ: 1.25, maxZ: 4.45 },
];

function buildContainment(scene) {
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x8fb6cf,
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.16,
    side: THREE.DoubleSide,
  });
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x39434e,
    roughness: 0.4,
    metalness: 0.8,
  });
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0xa8c8dd,
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
  });

  for (const zone of CONTAINMENT) {
    const width = zone.maxX - zone.minX;
    const depth = zone.maxZ - zone.minZ;
    const cx = (zone.minX + zone.maxX) / 2;
    const cz = (zone.minZ + zone.maxZ) / 2;
    const top = 2.32;

    const roof = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), roofMat);
    roof.rotation.x = Math.PI / 2;
    roof.position.set(cx, top, cz);
    scene.add(roof);

    // frame rails along both rack tops
    for (const z of [zone.minZ, zone.maxZ]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(width, 0.07, 0.07), frameMat);
      rail.position.set(cx, top, z);
      scene.add(rail);
    }
    // cross members, so the roof reads as panels rather than a sheet
    for (let x = zone.minX; x <= zone.maxX + 0.01; x += width / 6) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, depth), frameMat);
      strut.position.set(x, top, cz);
      scene.add(strut);
    }
    // end doors — you can walk through them, the entity will not
    for (const x of [zone.minX, zone.maxX]) {
      const door = new THREE.Mesh(new THREE.PlaneGeometry(depth, top), doorMat);
      door.rotation.y = Math.PI / 2;
      door.position.set(x, top / 2, cz);
      scene.add(door);

      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, top, 0.08), frameMat);
      post.position.set(x, top / 2, zone.minZ);
      scene.add(post);
      const post2 = post.clone();
      post2.position.z = zone.maxZ;
      scene.add(post2);
    }
  }
}

/** True when a point is inside a sealed cold aisle. */
export function inContainment(position) {
  return CONTAINMENT.some(
    (z) =>
      position.x > z.minX && position.x < z.maxX &&
      position.z > z.minZ && position.z < z.maxZ,
  );
}

// fewer, stronger fittings: every punctual light is evaluated per fragment, so
// this count is the single most expensive number in the project.
// `npm run lights` checks the hall is still evenly lit after changing it.
const LIGHT_COLS = 4;
const LIGHT_ROWS = 3;
const LIGHT_INSET = 2.2; // how close the outermost fixtures sit to the walls

/**
 * Fixture grid, spread evenly wall to wall. A fixed step used to leave a 6 m
 * gap in front of the CRAC wall, which is why the east side read as a cave.
 */
export function fixtureGrid() {
  const { minX, maxX, minZ, maxZ } = HALL;
  const spots = [];
  for (let r = 0; r < LIGHT_ROWS; r++) {
    const z = THREE.MathUtils.lerp(
      minZ + LIGHT_INSET, maxZ - LIGHT_INSET, r / (LIGHT_ROWS - 1),
    );
    for (let c = 0; c < LIGHT_COLS; c++) {
      const x = THREE.MathUtils.lerp(
        minX + LIGHT_INSET, maxX - LIGHT_INSET, c / (LIGHT_COLS - 1),
      );
      spots.push({ x, z });
    }
  }
  return spots;
}

/** Set once the hall is built; used to switch the rig between day and night. */
export const rig = {
  lampMat: null,
  troffers: [],
  washes: [],
  ambient: null,
  hemisphere: null,
  emergency: [],
  exitSigns: [],
  night: false,
  reserve: 1,
};

/**
 * The emergency rig runs off the UPS bank, so at night the light in the hall is
 * a resource with a clock on it rather than a switch — HORROR.md §5. Reserve 1
 * is a full bank; at 0 there is one fitting left over the door, and a torch.
 */
export const EMERGENCY = {
  full: 3.4,
  bulb: 0xffb26b,
  sign: 0x35ff8a,
  // A draining bank sheds non-critical load rather than browning everything out
  // equally, so fittings go dark one at a time. The archive goes first — it is
  // the least critical load in the building and nobody is supposed to be in
  // there — and after that it works inward from the far corners, so whatever is
  // still burning always points at the way out.
  shedOrder: [6, 1, 3, 0, 2, 5],
  shedAt: [0.70, 0.58, 0.46, 0.34, 0.22, 0.12],
  floor: 0.3, // dimmest the survivors ever get, as a fraction of `full`
  knee: 0.6, // above this the hall still looks like it did at 22:00
};

const BULB_LIT = new THREE.Color(EMERGENCY.bulb);
const SIGN_LIT = new THREE.Color(EMERGENCY.sign);

/** Where the emergency fittings hang. Shared by the builder and the light plan. */
function emergencySpots() {
  const { minX, maxX, minZ, maxZ } = HALL;
  return [
    [minX + 1.5, minZ + 4], [minX + 1.5, maxZ - 4],
    [maxX - 1.5, minZ + 4], [maxX - 1.5, maxZ - 4],
    [0, minZ + 1.5], [0, maxZ - 1.5],
    // index 6: the archive, and the first thing the bank lets go of
    [(TAPE_LIBRARY.minX + TAPE_LIBRARY.maxX) / 2, TAPE_LIBRARY.minZ + 2.8],
  ];
}

/**
 * What each fitting is burning at a given reserve, as plain numbers — 0 means
 * the bank has shed it. Pure, so tools/light-check.mjs can sample how dark the
 * hall actually gets without building a scene.
 */
export function emergencyLevels(reserve) {
  const r = THREE.MathUtils.clamp(reserve, 0, 1);
  const factor = EMERGENCY.floor
    + (1 - EMERGENCY.floor) * Math.min(1, r / EMERGENCY.knee);
  const shedCount = EMERGENCY.shedAt.filter((threshold) => r < threshold).length;
  const shed = new Set(EMERGENCY.shedOrder.slice(0, shedCount));
  return {
    shedCount,
    factor,
    levels: emergencySpots().map((_, i) => (shed.has(i) ? 0 : EMERGENCY.full * factor)),
  };
}

/** The night equivalent of lightPlan(), at a given state of the bank. */
export function emergencyPlan(reserve) {
  const { levels } = emergencyLevels(reserve);
  return emergencySpots()
    .map(([x, z], i) => ({ x, y: HALL.height - 1.4, z, intensity: levels[i], range: 11 }))
    .filter((l) => l.intensity > 0);
}

/** Cable trays and the light troffers that hang off them. */
function buildCeilingRig(scene) {
  const { minX, maxX, height } = HALL;
  const trayMat = new THREE.MeshStandardMaterial({
    color: 0x2a3138,
    roughness: 0.6,
    metalness: 0.7,
  });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x0e141a,
    emissive: 0xcfe6ff,
    emissiveIntensity: 2.1,
    roughness: 0.4,
  });
  rig.lampMat = lampMat;
  const trayGeo = new THREE.BoxGeometry(maxX - minX - 1, 0.14, 0.5);
  const lampGeo = new THREE.BoxGeometry(2.4, 0.08, 0.4);

  const spots = fixtureGrid();
  const rows = [...new Set(spots.map((s) => s.z))];
  for (const z of rows) {
    const tray = new THREE.Mesh(trayGeo, trayMat);
    tray.position.set((minX + maxX) / 2, height - 0.35, z);
    scene.add(tray);
  }
  for (const spot of spots) {
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(spot.x, height - 0.6, spot.z);
    scene.add(lamp);
  }
}

export const LIGHTING = {
  ambient: 1.3,
  hemisphere: 0.8,
  troffer: { intensity: 26, range: 24, height: HALL.height - 0.9 },
  // wall wash down the two equipment walls, where the CRACs, UPS bank and
  // panels live — these are work surfaces and need to be readable. Kept a
  // couple of metres off the faces so they light them rather than blow them out.
  wash: { intensity: 9, range: 11, height: 2.4, inset: 2.4, rows: [-4.5, 4.5] },
};

/** Every punctual light in the hall, as plain data — see tools/light-check.mjs. */
export function lightPlan() {
  const lights = fixtureGrid().map((spot) => ({
    x: spot.x,
    y: LIGHTING.troffer.height,
    z: spot.z,
    intensity: LIGHTING.troffer.intensity,
    range: LIGHTING.troffer.range,
  }));
  for (const x of [HALL.minX + LIGHTING.wash.inset, HALL.maxX - LIGHTING.wash.inset]) {
    for (const z of LIGHTING.wash.rows) {
      lights.push({
        x,
        y: LIGHTING.wash.height,
        z,
        intensity: LIGHTING.wash.intensity,
        range: LIGHTING.wash.range,
      });
    }
  }
  return lights;
}

function buildLighting(scene) {
  rig.hemisphere = new THREE.HemisphereLight(0xa8ccef, 0x121a22, LIGHTING.hemisphere);
  rig.ambient = new THREE.AmbientLight(0x2b3947, LIGHTING.ambient);
  scene.add(rig.hemisphere, rig.ambient);

  for (const spec of lightPlan()) {
    const isWash = spec.y === LIGHTING.wash.height;
    const light = new THREE.PointLight(
      isWash ? 0x9fc4e8 : 0xbfe0ff, spec.intensity, spec.range, 2,
    );
    light.position.set(spec.x, spec.y, spec.z);
    scene.add(light);
    (isWash ? rig.washes : rig.troffers).push(light);
  }

  buildEmergencyLighting(scene);
}

/**
 * Runs off the UPS, so it is the only thing left when the hall goes dark.
 * Built in every mode but dark until night falls.
 */
function buildEmergencyLighting(scene) {
  const { minX, maxX, minZ, maxZ, height } = HALL;

  const signMat = new THREE.MeshBasicMaterial({ color: 0x1d6b3f, toneMapped: false });
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x11181f, roughness: 0.8 });
  const signGeo = new THREE.PlaneGeometry(0.44, 0.18);

  // exit signs over the two doors — the landmarks you steer by in the dark
  for (const [x, z, ry] of [[0, minZ + 0.3, 0], [maxX - 0.3, 2, -Math.PI / 2]]) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.08), bodyMat);
    body.position.set(x, 2.6, z);
    body.rotation.y = ry;
    scene.add(body);

    const sign = new THREE.Mesh(signGeo, signMat.clone());
    sign.position.set(x, 2.6, z);
    sign.rotation.y = ry;
    sign.translateZ(0.05);
    scene.add(sign);
    rig.exitSigns.push(sign);
  }

  for (const [x, z] of emergencySpots()) {
    const lamp = new THREE.PointLight(EMERGENCY.bulb, 0, 11, 2);
    lamp.position.set(x, height - 1.4, z);
    scene.add(lamp);

    const bulb = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.1, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x2a2018, toneMapped: false }),
    );
    bulb.position.copy(lamp.position);
    scene.add(bulb);
    rig.emergency.push({ lamp, bulb });
  }
}

/**
 * Day is the working hall. Night kills the ceiling grid and leaves the
 * emergency fittings, which is all the mode really needs to feel different.
 */
export function setLightingMode(mode) {
  const night = mode === 'night';
  rig.night = night;

  for (const light of rig.troffers) light.visible = !night;
  for (const light of rig.washes) light.visible = !night;
  rig.ambient.intensity = night ? 0.22 : LIGHTING.ambient;
  rig.hemisphere.intensity = night ? 0.14 : LIGHTING.hemisphere;
  rig.ambient.color.set(night ? 0x1b2a3a : 0x2b3947);
  rig.lampMat.emissiveIntensity = night ? 0.02 : 2.1;

  // `base` is the level effects restore to, so two overlapping flickers can
  // never leave a fitting dead
  for (const entry of rig.emergency) {
    entry.shed = false;
    entry.base = night ? EMERGENCY.full : 0;
    entry.lamp.visible = night;
    entry.lamp.intensity = entry.base;
    entry.bulb.material.color.set(night ? EMERGENCY.bulb : 0x2a2018);
  }
  for (const sign of rig.exitSigns) {
    sign.material.color.set(night ? EMERGENCY.sign : 0x1d6b3f);
  }
  rig.reserve = 1;
}

/**
 * Drives the emergency rig from what is left in the UPS bank. Survivors dim on
 * a curve that stays flat until the bank is well down — a slow even fade is
 * something you never notice, whereas a fitting going out is an event.
 *
 * Returns the number of fittings shed, so the caller can say something the
 * first time one drops.
 */
export function setEmergencyReserve(reserve) {
  rig.reserve = THREE.MathUtils.clamp(reserve, 0, 1);
  if (!rig.night) return 0;

  const { levels, factor, shedCount } = emergencyLevels(rig.reserve);

  rig.emergency.forEach((entry, i) => {
    entry.shed = levels[i] === 0;
    entry.base = levels[i];
    // a dark light still costs a full evaluation per fragment, so shed it
    // rather than dimming it to zero — see the light budget in tools/perf-check
    entry.lamp.visible = !entry.shed;
    entry.lamp.intensity = entry.base;
    entry.bulb.material.color.copy(BULB_LIT).multiplyScalar(entry.shed ? 0.08 : factor);
  });

  // the signs are the last thing on the bank: they gutter, they never go out
  for (const sign of rig.exitSigns) {
    sign.material.color.copy(SIGN_LIT)
      .multiplyScalar(rig.reserve < EMERGENCY.shedAt.at(-1) ? 0.55 : 1);
  }
  return shedCount;
}
