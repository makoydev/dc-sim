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

/** Cable trays and the light troffers that hang off them. */
function buildCeilingRig(scene) {
  const { minX, maxX, minZ, maxZ, height } = HALL;
  const trayMat = new THREE.MeshStandardMaterial({
    color: 0x2a3138,
    roughness: 0.6,
    metalness: 0.7,
  });
  const lampMat = new THREE.MeshStandardMaterial({
    color: 0x0e141a,
    emissive: 0xcfe6ff,
    emissiveIntensity: 1.6,
    roughness: 0.4,
  });

  for (let z = minZ + 3; z <= maxZ - 3; z += 4.8) {
    const tray = new THREE.Mesh(
      new THREE.BoxGeometry(maxX - minX - 1, 0.14, 0.5),
      trayMat,
    );
    tray.position.set((minX + maxX) / 2, height - 0.35, z);
    scene.add(tray);

    for (let x = minX + 3; x <= maxX - 3; x += 5.2) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.36), lampMat);
      lamp.position.set(x, height - 0.6, z + 0.8);
      scene.add(lamp);
    }
  }
}

function buildLighting(scene) {
  const { minX, maxX, minZ, maxZ, height } = HALL;
  scene.add(new THREE.HemisphereLight(0x9fc4e8, 0x0b1116, 0.55));
  scene.add(new THREE.AmbientLight(0x24303c, 1.0));

  for (let z = minZ + 3; z <= maxZ - 3; z += 4.8) {
    for (let x = minX + 3; x <= maxX - 3; x += 5.2) {
      const light = new THREE.PointLight(0xbfe0ff, 12, 14, 2);
      light.position.set(x, height - 0.9, z + 0.8);
      scene.add(light);
    }
  }
}
