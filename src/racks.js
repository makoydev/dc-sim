import * as THREE from 'three';
import { addCollider } from './world.js';
import { rackFrontTexture, rackBackTexture } from './textures.js';
import { registerPickable } from './pickables.js';

export const RACK = { w: 0.76, h: 2.1, d: 1.1 };

// z position of each row and the direction its front faces.
const ROWS = [
  { name: 'A', z: -8.2, facing: -1 },
  { name: 'B', z: -5.9, facing: 1 },
  { name: 'C', z: -1.6, facing: -1 },
  { name: 'D', z: 0.7, facing: 1 },
  { name: 'E', z: 5.0, facing: -1 },
  { name: 'F', z: 7.3, facing: 1 },
];
const PER_ROW = 12;
const SPACING = 0.78;

/**
 * All 72 racks are identical boxes, so they go through the renderer as four
 * instanced meshes rather than 288 individual ones. Picking and highlighting
 * use a per-rack invisible hitbox, which costs nothing to draw.
 */
export function buildRacks(scene) {
  const total = ROWS.length * PER_ROW;
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x1b2129,
    roughness: 0.55,
    metalness: 0.8,
  });
  const frontMat = new THREE.MeshStandardMaterial({
    map: rackFrontTexture(), roughness: 0.85,
  });
  const backMat = new THREE.MeshStandardMaterial({
    map: rackBackTexture(), roughness: 0.9,
  });
  const ledMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });

  const frames = new THREE.InstancedMesh(
    new THREE.BoxGeometry(RACK.w, RACK.h, RACK.d), frameMat, total,
  );
  const fronts = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(RACK.w - 0.06, RACK.h - 0.12), frontMat, total,
  );
  const backs = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(RACK.w - 0.06, RACK.h - 0.12), backMat, total,
  );
  const leds = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.05, 0.05, 0.02), ledMat, total,
  );
  leds.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  for (const mesh of [frames, fronts, backs, leds]) {
    mesh.frustumCulled = false; // one bounding volume for the whole hall
    scene.add(mesh);
  }

  const hitGeo = new THREE.BoxGeometry(RACK.w, RACK.h, RACK.d);
  const racks = [];
  const startX = -((PER_ROW - 1) * SPACING) / 2;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);

  let index = 0;
  for (const row of ROWS) {
    const yaw = row.facing < 0 ? Math.PI : 0;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const forward = row.facing < 0 ? -1 : 1;

    for (let i = 0; i < PER_ROW; i++) {
      const x = startX + i * SPACING;
      const centreY = RACK.h / 2;

      frames.setMatrixAt(index, m.compose(pos.set(x, centreY, row.z), q, one));
      fronts.setMatrixAt(
        index,
        m.compose(pos.set(x, centreY, row.z + forward * (RACK.d / 2 + 0.005)), q, one),
      );
      backs.setMatrixAt(
        index,
        m.compose(
          pos.set(x, centreY, row.z - forward * (RACK.d / 2 + 0.005)),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + Math.PI),
          one,
        ),
      );
      leds.setMatrixAt(
        index,
        m.compose(
          pos.set(
            x - forward * (RACK.w / 2 - 0.09),
            RACK.h - 0.09,
            row.z + forward * (RACK.d / 2 + 0.02),
          ),
          q,
          one,
        ),
      );

      // invisible, so it never reaches the renderer, but it is what the
      // crosshair hits and what the focus brackets are sized from
      const hitbox = new THREE.Mesh(hitGeo, hitMat);
      hitbox.position.set(x, centreY, row.z);
      hitbox.rotation.y = yaw;
      hitbox.visible = false;
      scene.add(hitbox);

      const rack = {
        id: `${row.name}${String(i + 1).padStart(2, '0')}`,
        row: row.name,
        index,
        group: hitbox, // everything that asks for a rack's transform uses this
        frame: hitbox,
        frontSpot: new THREE.Vector3(x, 0, row.z + row.facing * 1.3),
        temp: 21 + Math.random() * 2,
        load: 0.3 + Math.random() * 0.4,
        fault: null, // set by the incident system
      };
      hitbox.userData.rack = rack;
      registerPickable(hitbox);
      racks.push(rack);
      index++;
    }
  }

  for (const mesh of [frames, fronts, backs, leds]) mesh.instanceMatrix.needsUpdate = true;

  // one collider per row instead of 12, since the racks are flush
  for (const row of ROWS) {
    addCollider(0, row.z, PER_ROW * SPACING, RACK.d);
  }

  racks.leds = leds;
  return racks;
}

const GREEN = new THREE.Color(0x46d39a);
const AMBER = new THREE.Color(0xffc247);
const RED = new THREE.Color(0xff3b30);
const DARK = new THREE.Color(0x0a1a12);
const scratch = new THREE.Color();

/**
 * One instanced colour buffer for all 72 status lights: the blink is a colour
 * change rather than an opacity change, because instances share a material.
 */
export function updateRackLeds(racks, elapsed) {
  const leds = racks.leds;
  if (!leds) return;
  const blink = Math.sin(elapsed * 9) > 0;

  for (const rack of racks) {
    if (rack.ledOverride) scratch.copy(rack.ledOverride);
    else if (rack.fault) {
      scratch.copy(rack.fault.severity === 'critical' ? RED : AMBER);
      if (!blink) scratch.multiplyScalar(0.15);
    } else scratch.copy(rack.temp > 27 ? AMBER : GREEN);

    if (rack.dark) scratch.copy(DARK);
    leds.setColorAt(rack.index, scratch);
  }
  if (leds.instanceColor) leds.instanceColor.needsUpdate = true;
}
