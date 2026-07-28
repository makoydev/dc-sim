import * as THREE from 'three';
import { floorTexture, wallTexture } from './textures.js';
import { registerPickable } from './pickables.js';

export const HALL = { minX: -13, maxX: 13, minZ: -11, maxZ: 11, height: 4.2 };

/** Axis-aligned boxes the player cannot walk through. */
export const colliders = [];

export function addCollider(cx, cz, sx, sz) {
  colliders.push({
    minX: cx - sx / 2,
    maxX: cx + sx / 2,
    minZ: cz - sz / 2,
    maxZ: cz + sz / 2,
  });
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
  wall(scene, wallMat, w + t * 2, height, t, cx, height / 2, maxZ + t / 2);
  wall(scene, wallMat, t, height, d, minX - t / 2, height / 2, cz);
  wall(scene, wallMat, t, height, d, maxX + t / 2, height / 2, cz);

  buildCeilingRig(scene);
  buildLighting(scene);
  return { floor, ceiling };
}

const LIGHT_COLS = 5;
const LIGHT_ROWS = 4;
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
  troffer: { intensity: 15, range: 18, height: HALL.height - 0.9 },
  // wall wash down the two equipment walls, where the CRACs, UPS bank and
  // panels live — these are work surfaces and need to be readable. Kept a
  // couple of metres off the faces so they light them rather than blow them out.
  wash: { intensity: 6, range: 9, height: 2.4, inset: 2.4, rows: [-6, 0, 6] },
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
  scene.add(new THREE.HemisphereLight(0xa8ccef, 0x121a22, LIGHTING.hemisphere));
  scene.add(new THREE.AmbientLight(0x2b3947, LIGHTING.ambient));

  for (const spec of lightPlan()) {
    const isWash = spec.y === LIGHTING.wash.height;
    const light = new THREE.PointLight(
      isWash ? 0x9fc4e8 : 0xbfe0ff, spec.intensity, spec.range, 2,
    );
    light.position.set(spec.x, spec.y, spec.z);
    scene.add(light);
  }
}
