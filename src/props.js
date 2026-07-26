import * as THREE from 'three';
import { addCollider } from './world.js';
import { Screen } from './screen.js';

const metal = (color, rough = 0.5, met = 0.85) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: met });

const MAT = {
  case: metal(0x232a32),
  darkCase: metal(0x161c22),
  trim: metal(0x39434e, 0.4),
  rubber: new THREE.MeshStandardMaterial({ color: 0x0d1116, roughness: 1, metalness: 0 }),
  glass: new THREE.MeshStandardMaterial({
    color: 0x0a1620, roughness: 0.15, metalness: 0.4,
    transparent: true, opacity: 0.5,
  }),
};

function box(parent, w, h, d, x, y, z, mat = MAT.case) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function led(parent, color, x, y, z, size = 0.05) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, 0.02),
    new THREE.MeshBasicMaterial({ color }),
  );
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

/** Builds every fixed station in the hall. Returns stations + animated parts. */
export function buildProps(scene) {
  const stations = [];
  const fans = [];
  const screens = [];

  const add = (station) => {
    station.mesh.userData.station = station;
    stations.push(station);
    return station;
  };

  // ---- CRAC units along the east wall -------------------------------------
  [-7, -2.4, 2.2, 6.8].forEach((z, i) => {
    const g = new THREE.Group();
    g.position.set(12.1, 0, z);
    g.rotation.y = -Math.PI / 2; // front faces -x, into the hall
    scene.add(g);

    box(g, 2.0, 2.7, 1.1, 0, 1.35, 0, MAT.case);
    box(g, 2.1, 0.12, 1.2, 0, 2.76, 0, MAT.trim);
    const grille = box(g, 1.7, 1.4, 0.06, 0, 1.15, 0.58, MAT.rubber);
    grille.material = MAT.darkCase;

    // two fan guards with spinning blades
    for (const fx of [-0.42, 0.42]) {
      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.06, 8),
        MAT.trim,
      );
      hub.rotation.x = Math.PI / 2;
      hub.position.set(fx, 1.15, 0.62);
      g.add(hub);
      const blades = new THREE.Group();
      blades.position.set(fx, 1.15, 0.6);
      for (let b = 0; b < 5; b++) {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.34, 0.07, 0.02),
          MAT.trim,
        );
        blade.position.set(Math.cos((b / 5) * Math.PI * 2) * 0.17, Math.sin((b / 5) * Math.PI * 2) * 0.17, 0);
        blade.rotation.z = (b / 5) * Math.PI * 2;
        blades.add(blade);
      }
      g.add(blades);
      fans.push({ mesh: blades, speed: 6 });
    }

    const screen = new Screen(0.5, 0.34, 300);
    screen.mesh.position.set(0, 2.15, 0.57);
    g.add(screen.mesh);

    const unit = add({
      id: `CRAC-0${i + 1}`,
      kind: 'crac',
      label: `CRAC-0${i + 1}`,
      position: new THREE.Vector3(12.1, 1.3, z),
      mesh: g.children[0],
      screen,
      supply: 17 + Math.random(),
      ret: 26 + Math.random(),
      filterHours: Math.round(1200 + Math.random() * 900),
      running: true,
      fans: fans.slice(-2),
    });
    screens.push(unit);
    addCollider(12.1, z, 1.1, 2.0);
  });

  // ---- UPS + battery cabinets along the west wall --------------------------
  [-3.2, -2.05, -0.9].forEach((z, i) => {
    const g = new THREE.Group();
    g.position.set(-12.2, 0, z);
    g.rotation.y = Math.PI / 2; // faces +x
    scene.add(g);
    box(g, 1.05, 2.0, 0.9, 0, 1.0, 0, MAT.case);
    box(g, 0.9, 0.5, 0.04, 0, 1.55, 0.47, MAT.darkCase);
    for (let b = 0; b < 6; b++) led(g, 0x46d39a, -0.3 + b * 0.12, 0.5, 0.46, 0.04);

    const screen = new Screen(0.44, 0.3, 300);
    screen.mesh.position.set(0, 1.55, 0.48);
    g.add(screen.mesh);

    const unit = add({
      id: `UPS-${String.fromCharCode(65 + i)}`,
      kind: 'ups',
      label: `UPS-${String.fromCharCode(65 + i)}`,
      position: new THREE.Vector3(-12.2, 1.2, z),
      mesh: g.children[0],
      screen,
      charge: 0.9 + Math.random() * 0.1,
      load: 0.35 + Math.random() * 0.25,
      onBattery: false,
      selfTested: false,
    });
    screens.push(unit);
    addCollider(-12.2, z, 0.9, 1.05);
  });

  // battery string (scenery)
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    g.position.set(-12.3, 0, 1.1 + i * 1.0);
    scene.add(g);
    box(g, 0.8, 1.8, 0.95, 0, 0.9, 0, MAT.darkCase);
    for (let s = 0; s < 3; s++) box(g, 0.72, 0.06, 0.9, 0, 0.5 + s * 0.5, 0.04, MAT.trim);
    addCollider(-12.3, 1.1 + i * 1.0, 0.95, 0.8);
  }

  // ---- Power distribution panels ------------------------------------------
  [-7.4, -5.9].forEach((z, i) => {
    const g = new THREE.Group();
    g.position.set(-12.6, 0, z);
    g.rotation.y = Math.PI / 2;
    scene.add(g);
    box(g, 1.1, 1.5, 0.28, 0, 1.5, 0, MAT.trim);
    const door = box(g, 0.95, 1.3, 0.05, 0, 1.5, 0.16, MAT.darkCase);
    for (let b = 0; b < 8; b++) {
      const sw = box(g, 0.07, 0.14, 0.05, -0.32 + (b % 4) * 0.2, 1.75 - Math.floor(b / 4) * 0.3, 0.2, MAT.trim);
      sw.material = new THREE.MeshStandardMaterial({ color: 0x2b3742, roughness: 0.6 });
    }
    add({
      id: `PDU-${i + 1}`,
      kind: 'pdu',
      label: `PDU-${i + 1}`,
      position: new THREE.Vector3(-12.6, 1.5, z),
      mesh: door,
      breakerTripped: false,
      loadKw: 42 + Math.random() * 20,
    });
  });

  // ---- NOC desk ------------------------------------------------------------
  {
    const g = new THREE.Group();
    g.position.set(8.6, 0, -9.4);
    scene.add(g);
    box(g, 3.0, 0.07, 1.0, 0, 0.75, 0, MAT.trim);
    box(g, 0.08, 0.75, 0.9, -1.4, 0.37, 0, MAT.case);
    box(g, 0.08, 0.75, 0.9, 1.4, 0.37, 0, MAT.case);
    box(g, 0.44, 0.02, 0.16, 0, 0.79, 0.28, MAT.darkCase); // keyboard

    const monitors = [];
    [-0.98, 0, 0.98].forEach((x, i) => {
      const stand = box(g, 0.1, 0.28, 0.1, x, 0.92, -0.1, MAT.darkCase);
      const screen = new Screen(0.86, 0.5, 320);
      screen.mesh.position.set(x, 1.35, -0.06);
      screen.mesh.rotation.y = -x * 0.28;
      g.add(screen.mesh);
      const bezel = box(g, 0.92, 0.56, 0.03, x, 1.35, -0.1, MAT.darkCase);
      bezel.rotation.y = -x * 0.28;
      monitors.push(screen);
    });

    // chair
    const chair = new THREE.Group();
    chair.position.set(0, 0, 0.95);
    g.add(chair);
    box(chair, 0.5, 0.07, 0.5, 0, 0.46, 0, MAT.rubber);
    box(chair, 0.5, 0.55, 0.08, 0, 0.75, 0.24, MAT.rubber);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.42, 8), MAT.trim);
    post.position.set(0, 0.22, 0);
    chair.add(post);

    const station = add({
      id: 'NOC',
      kind: 'noc',
      label: 'NOC Terminal',
      position: new THREE.Vector3(8.6, 1.2, -9.4),
      mesh: g.children[0],
      monitors,
    });
    screens.push(station);
    addCollider(8.6, -9.4, 1.0, 3.0);
    addCollider(8.6, -8.45, 0.6, 0.6);
  }

  // ---- Spare parts shelving -----------------------------------------------
  {
    const g = new THREE.Group();
    g.position.set(-8.6, 0, 9.6);
    scene.add(g);
    for (const x of [-1.3, 1.3]) {
      box(g, 0.08, 2.1, 0.6, x, 1.05, 0, MAT.trim);
    }
    for (let s = 0; s < 4; s++) {
      box(g, 2.7, 0.05, 0.6, 0, 0.4 + s * 0.5, 0, MAT.trim);
    }
    // spare drives and cable coils on the shelves
    const driveMat = metal(0x2f3944, 0.5);
    for (let i = 0; i < 8; i++) {
      box(g, 0.24, 0.12, 0.4, -1.05 + (i % 4) * 0.3, 0.5 + Math.floor(i / 4) * 0.5, 0, driveMat);
    }
    for (let i = 0; i < 4; i++) {
      const coil = new THREE.Mesh(
        new THREE.TorusGeometry(0.14, 0.035, 8, 20),
        new THREE.MeshStandardMaterial({ color: [0x2f7ad6, 0xd64f4f, 0xe0c341, 0x3fb87a][i], roughness: 0.8 }),
      );
      coil.rotation.x = Math.PI / 2;
      coil.position.set(0.15 + (i % 2) * 0.5, 1.48 + Math.floor(i / 2) * 0.5, 0);
      g.add(coil);
    }
    add({
      id: 'SPARES',
      kind: 'spares',
      label: 'Spares Cage',
      position: new THREE.Vector3(-8.6, 1.2, 9.6),
      mesh: g.children[2],
    });
    addCollider(-8.6, 9.6, 0.6, 2.7);
  }

  // ---- E-waste bin ---------------------------------------------------------
  {
    const bin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.3, 0.9, 12),
      metal(0x3a2b2b, 0.7, 0.3),
    );
    bin.position.set(-6.0, 0.45, 9.7);
    scene.add(bin);
    add({
      id: 'EWASTE',
      kind: 'ewaste',
      label: 'E-Waste Bin',
      position: bin.position.clone(),
      mesh: bin,
    });
    addCollider(-6.0, 9.7, 0.7, 0.7);
  }

  // ---- VESDA / fire panel --------------------------------------------------
  {
    const g = new THREE.Group();
    g.position.set(-1.5, 0, -10.7);
    scene.add(g);
    const panel = box(g, 0.7, 0.9, 0.16, 0, 1.5, 0, new THREE.MeshStandardMaterial({ color: 0x8c2f2a, roughness: 0.6 }));
    box(g, 0.5, 0.3, 0.04, 0, 1.68, 0.1, MAT.darkCase);
    led(g, 0x46d39a, -0.2, 1.28, 0.1);
    led(g, 0xffc247, 0, 1.28, 0.1);
    led(g, 0xff3b30, 0.2, 1.28, 0.1);
    const screen = new Screen(0.46, 0.26, 320);
    screen.mesh.position.set(0, 1.68, 0.11);
    g.add(screen.mesh);
    const station = add({
      id: 'VESDA',
      kind: 'fire',
      label: 'Fire / VESDA Panel',
      position: new THREE.Vector3(-1.5, 1.5, -10.7),
      mesh: panel,
      screen,
      alarm: false,
    });
    screens.push(station);
  }

  // ---- Coffee machine ------------------------------------------------------
  {
    const g = new THREE.Group();
    g.position.set(-11.4, 0, -9.6);
    scene.add(g);
    box(g, 0.9, 0.06, 0.6, 0, 0.9, 0, MAT.trim); // counter
    for (const x of [-0.38, 0.38]) box(g, 0.06, 0.9, 0.55, x, 0.45, 0, MAT.case);
    const body = box(g, 0.44, 0.6, 0.4, 0, 1.23, 0, MAT.darkCase);
    box(g, 0.3, 0.06, 0.3, 0, 1.0, 0.06, MAT.trim);
    led(g, 0xff8a3d, 0.15, 1.42, 0.21, 0.04);
    add({
      id: 'COFFEE',
      kind: 'coffee',
      label: 'Coffee Machine',
      position: new THREE.Vector3(-11.4, 1.2, -9.6),
      mesh: body,
    });
    addCollider(-11.4, -9.6, 0.6, 0.9);
  }

  return { stations, fans, screens };
}

export function updateFans(fans, dt, running = true) {
  for (const fan of fans) {
    fan.mesh.rotation.z += (running ? fan.speed : 0) * dt;
  }
}
