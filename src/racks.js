import * as THREE from 'three';
import { addCollider } from './world.js';
import { rackFrontTexture, rackBackTexture } from './textures.js';

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

export function buildRacks(scene) {
  const frontTex = rackFrontTexture();
  const backTex = rackBackTexture();
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x1b2129,
    roughness: 0.55,
    metalness: 0.8,
  });
  const frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.85 });
  const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.9 });
  const panelGeo = new THREE.PlaneGeometry(RACK.w - 0.06, RACK.h - 0.12);
  const frameGeo = new THREE.BoxGeometry(RACK.w, RACK.h, RACK.d);
  const ledGeo = new THREE.BoxGeometry(0.05, 0.05, 0.02);

  const racks = [];
  const startX = -((PER_ROW - 1) * SPACING) / 2;

  for (const row of ROWS) {
    for (let i = 0; i < PER_ROW; i++) {
      const x = startX + i * SPACING;
      const group = new THREE.Group();
      group.position.set(x, RACK.h / 2, row.z);
      group.rotation.y = row.facing < 0 ? Math.PI : 0;

      const frame = new THREE.Mesh(frameGeo, frameMat);
      group.add(frame);

      const front = new THREE.Mesh(panelGeo, frontMat);
      front.position.z = RACK.d / 2 + 0.005;
      group.add(front);

      const back = new THREE.Mesh(panelGeo, backMat);
      back.position.z = -RACK.d / 2 - 0.005;
      back.rotation.y = Math.PI;
      group.add(back);

      const led = new THREE.Mesh(
        ledGeo,
        new THREE.MeshBasicMaterial({ color: 0x46d39a }),
      );
      led.position.set(RACK.w / 2 - 0.09, RACK.h / 2 - 0.09, RACK.d / 2 + 0.02);
      group.add(led);

      scene.add(group);

      const rack = {
        id: `${row.name}${String(i + 1).padStart(2, '0')}`,
        row: row.name,
        group,
        frame,
        led,
        // world position of the spot an engineer stands in to work the front
        frontSpot: new THREE.Vector3(x, 0, row.z + row.facing * 1.3),
        temp: 21 + Math.random() * 2,
        load: 0.3 + Math.random() * 0.4,
        fault: null, // set by the incident system
      };
      // tag the whole group so looking at any part of the rack counts
      group.userData.rack = rack;
      frame.userData.rack = rack;
      racks.push(rack);
    }
  }

  // one collider per row instead of 12, since the racks are flush
  for (const row of ROWS) {
    addCollider(0, row.z, PER_ROW * SPACING, RACK.d);
  }

  return racks;
}

const GREEN = new THREE.Color(0x46d39a);
const AMBER = new THREE.Color(0xffc247);
const RED = new THREE.Color(0xff3b30);

export function updateRackLeds(racks, elapsed) {
  const blink = Math.sin(elapsed * 9) > 0;
  for (const rack of racks) {
    const mat = rack.led.material;
    if (rack.fault) {
      mat.color.copy(rack.fault.severity === 'critical' ? RED : AMBER);
      mat.opacity = blink ? 1 : 0.15;
      mat.transparent = true;
    } else {
      mat.color.copy(rack.temp > 27 ? AMBER : GREEN);
      mat.opacity = 1;
      mat.transparent = false;
    }
  }
}
