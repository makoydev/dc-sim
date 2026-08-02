import * as THREE from 'three';
import { addCollider, HALL, TAPE_DOOR, TAPE_LIBRARY } from './world.js';
import { Screen } from './screen.js';
import { registerPickable } from './pickables.js';

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

const HIT_MAT = new THREE.MeshBasicMaterial({ visible: false });
const BLADE_GEO = new THREE.BoxGeometry(0.34, 0.07, 0.02);

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

  // Each prop gets one invisible box covering its whole footprint. Looking
  // anywhere on a CRAC — grille, display, fan — picks the unit, and the box
  // doubles as the bounds the focus brackets are drawn around.
  const add = (station, root) => {
    station.mesh.userData.station = station;
    station.root = root ?? station.mesh;
    if (root) root.userData.station = station;

    const bounds = new THREE.Box3().setFromObject(station.root);
    const size = bounds.getSize(new THREE.Vector3());
    const hit = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), HIT_MAT);
    hit.position.copy(bounds.getCenter(new THREE.Vector3()));
    hit.visible = false; // still raycastable — three only skips on layers
    hit.userData.station = station;
    scene.add(hit);
    registerPickable(hit);

    station.bounds = bounds;
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
      // five blades as one instanced draw call rather than five meshes
      const blades = new THREE.InstancedMesh(BLADE_GEO, MAT.trim, 5);
      blades.position.set(fx, 1.15, 0.6);
      const m = new THREE.Matrix4();
      for (let b = 0; b < 5; b++) {
        const angle = (b / 5) * Math.PI * 2;
        m.makeRotationZ(angle);
        m.setPosition(Math.cos(angle) * 0.17, Math.sin(angle) * 0.17, 0);
        blades.setMatrixAt(b, m);
      }
      blades.instanceMatrix.needsUpdate = true;
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
    }, g);
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
    }, g);
    screens.push(unit);
    addCollider(-12.2, z, 0.9, 1.05);
  });

  // battery string (scenery)
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    g.position.set(-12.3, 0, 1.1 + i * 1.0);
    scene.add(g);
    registerPickable(box(g, 0.8, 1.8, 0.95, 0, 0.9, 0, MAT.darkCase)); // occluder only
    for (let s = 0; s < 3; s++) box(g, 0.72, 0.06, 0.9, 0, 0.5 + s * 0.5, 0.04, MAT.trim);
    addCollider(-12.3, 1.1 + i * 1.0, 0.8, 0.95);
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
    }, g);
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
    }, g);
    screens.push(station);
    addCollider(8.6, -9.4, 3.0, 1.0);
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
    }, g);
    addCollider(-8.6, 9.6, 2.7, 0.6);
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
    }, g);
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
    }, g);
    addCollider(-11.4, -9.6, 0.9, 0.6);
  }

  // ---- places to get inside or under ---------------------------------------

  /**
   * `hide` describes where the camera goes and which way it may look: inside a
   * cabinet you get a slot of vision and nothing else.
   */
  const hideSpot = (station, hide) => {
    station.hide = hide;
    return add(station, hide.root);
  };

  // tall storage cabinets, west wall and south-east corner
  for (const [x, z, ry, label] of [
    [-12.2, 6.4, Math.PI / 2, 'Storage Cabinet'],
    [11.7, 9.4, -Math.PI / 2, 'Storage Cabinet'],
  ]) {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    scene.add(g);

    const body = box(g, 1.0, 2.05, 0.66, 0, 1.02, 0, MAT.case);
    box(g, 1.04, 0.06, 0.7, 0, 2.06, 0, MAT.trim);
    for (const side of [-1, 1]) {
      const door = box(g, 0.48, 1.9, 0.04, side * 0.25, 1.02, 0.34, MAT.darkCase);
      door.material = MAT.trim;
      const handle = box(g, 0.03, 0.22, 0.04, side * 0.04, 1.02, 0.38, MAT.darkCase);
      handle.material = MAT.case;
    }
    // louvres, so it reads as a cabinet rather than a block
    for (let i = 0; i < 6; i++) {
      box(g, 0.86, 0.02, 0.02, 0, 1.72 - i * 0.09, 0.37, MAT.darkCase);
    }

    const inward = new THREE.Vector3(Math.sin(ry + Math.PI), 0, Math.cos(ry + Math.PI));
    hideSpot(
      {
        id: `HIDE-CAB-${z > 0 && x > 0 ? 'E' : 'W'}`,
        kind: 'hide',
        label,
        position: new THREE.Vector3(x, 1.1, z),
        mesh: body,
      },
      {
        root: g,
        under: false,
        // stand inside it, looking out through the doors
        camera: new THREE.Vector3(x, 1.24, z),
        exit: new THREE.Vector3(x, 0, z).addScaledVector(inward, -1.15),
        yaw: ry + Math.PI / 2,
        arc: 0.75,
      },
    );
    addCollider(x, z, ry === 0 ? 1.0 : 0.66, ry === 0 ? 0.66 : 1.0);
  }

  // workbenches you can get under
  for (const [bx, bz, bry, exitX, exitZ, id] of [
    [-7.6, -10.1, 0, -7.6, -9.0, 'HIDE-BENCH-W'],
    [9.6, 3.4, Math.PI / 2, 8.4, 3.4, 'HIDE-BENCH-E'],
  ]) {
    const g = new THREE.Group();
    g.position.set(bx, 0, bz);
    g.rotation.y = bry;
    scene.add(g);
    box(g, 2.2, 0.08, 0.85, 0, 0.92, 0, MAT.trim);
    for (const x of [-1.0, 1.0]) {
      box(g, 0.08, 0.92, 0.08, x, 0.46, -0.35, MAT.case);
      box(g, 0.08, 0.92, 0.08, x, 0.46, 0.35, MAT.case);
    }
    box(g, 2.0, 0.05, 0.7, 0, 0.28, 0, MAT.case); // lower shelf
    // clutter on top
    box(g, 0.3, 0.14, 0.22, -0.6, 1.03, 0, MAT.darkCase);
    box(g, 0.22, 0.1, 0.16, 0.5, 1.01, 0.1, MAT.case);
    const spool = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.1, 12),
      new THREE.MeshStandardMaterial({ color: 0x2f7ad6, roughness: 0.8 }),
    );
    spool.rotation.x = Math.PI / 2;
    spool.position.set(0.05, 1.01, -0.1);
    g.add(spool);

    hideSpot(
      {
        id,
        kind: 'hide',
        label: 'Workbench',
        position: new THREE.Vector3(bx, 1.0, bz),
        mesh: g.children[0],
      },
      {
        root: g,
        under: true,
        camera: new THREE.Vector3(bx, 0.62, bz).lerp(
          new THREE.Vector3(exitX, 0.62, exitZ), 0.12,
        ),
        exit: new THREE.Vector3(exitX, 0, exitZ),
        yaw: bry === 0 ? Math.PI : Math.PI / 2,
        arc: 1.0,
      },
    );
    addCollider(bx, bz, bry === 0 ? 2.2 : 0.85, bry === 0 ? 0.85 : 2.2);
  }

  // ---- the tape archive, through the south wall ----------------------------
  const doorway = buildTapeArchive(scene, { add, hideSpot });

  return { stations, fans, screens, doorway };
}

/**
 * The archive. Nothing in here is on the checklist and nothing in here is
 * cooled, which is the whole reason to build it: it is the one room where the
 * fan wall is not covering the noise you make.
 *
 * The reason to walk in is the spare torch cells. The torch is the only
 * reliable light once the bank starts shedding zones, and the cells for it are
 * kept in the quietest, darkest room in the building. That trade is the room.
 */
function buildTapeArchive(scene, { add, hideSpot }) {
  const { minX, maxX, minZ, maxZ } = TAPE_LIBRARY;
  const cx = (minX + maxX) / 2;

  // the door itself: shut and badged by day, standing open by the time you
  // come on at night, which nobody has an explanation for
  const doorGroup = new THREE.Group();
  doorGroup.position.set(TAPE_DOOR.minX, 0, HALL.maxZ + 0.2);
  scene.add(doorGroup);
  const leaf = box(doorGroup, TAPE_DOOR.maxX - TAPE_DOOR.minX, 2.4, 0.08,
    (TAPE_DOOR.maxX - TAPE_DOOR.minX) / 2, 1.2, 0, MAT.trim);
  box(doorGroup, 0.06, 0.3, 0.05, TAPE_DOOR.maxX - TAPE_DOOR.minX - 0.18, 1.05, 0.08, MAT.case);

  const blocker = addCollider(cx, HALL.maxZ + 0.2, TAPE_DOOR.maxX - TAPE_DOOR.minX, 0.4);
  const door = add({
    id: 'TAPE-DOOR',
    kind: 'tapedoor',
    label: 'Tape Archive',
    position: new THREE.Vector3(cx, 1.2, HALL.maxZ + 0.2),
    mesh: leaf,
    blocker,
    group: doorGroup,
  }, doorGroup);

  // Two double-sided runs of cartridges, leaving a 1.5 m corridor down each
  // side and an open strip at the back. Aisles you can actually be cornered in.
  //
  // There are 160-odd cartridges and they are one instanced draw, for the same
  // reason the racks are — see tools/perf-check.mjs, which caught this as a
  // 180-call regression when they were separate meshes.
  const runs = [minZ + 1.8, minZ + 3.6];
  const perShelf = 17;
  const shelves = 5;
  const carts = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.22, 0.3, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x1a2028, roughness: 0.85, metalness: 0.1 }),
    runs.length * shelves * perShelf,
  );
  carts.frustumCulled = false;
  scene.add(carts);

  const m = new THREE.Matrix4();
  const spine = new THREE.Color(0x1a2028);
  const worn = new THREE.Color(0x0d1116);
  const labelled = new THREE.Color(0x3a4654);
  let n = 0;

  // the boards and uprights are repeated furniture too, so they get the same
  // treatment: two draws for both runs rather than sixteen meshes
  const boards = new THREE.InstancedMesh(
    new THREE.BoxGeometry(5.1, 0.04, 0.86), MAT.case, runs.length * (shelves + 1),
  );
  const uprights = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.09, 2.05, 0.9), MAT.case, runs.length * 3,
  );
  for (const mesh of [boards, uprights]) {
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  let boardN = 0;
  let uprightN = 0;

  for (const z of runs) {
    for (const x of [-2.5, 0, 2.5]) {
      m.makeTranslation(cx + x, 1.02, z);
      uprights.setMatrixAt(uprightN++, m);
    }
    m.makeTranslation(cx, 2.05, z);
    boards.setMatrixAt(boardN++, m);
    for (let shelf = 0; shelf < shelves; shelf++) {
      const y = 0.36 + shelf * 0.42;
      m.makeTranslation(cx, y, z);
      boards.setMatrixAt(boardN++, m);
      for (let i = 0; i < perShelf; i++) {
        // gaps where tapes are signed out, so the runs are not a solid wall
        if ((i + shelf) % 7 === 3) continue;
        m.makeTranslation(cx - 2.24 + i * 0.28, y + 0.17, z);
        carts.setMatrixAt(n, m);
        carts.setColorAt(n, (i + shelf) % 3 === 0 ? worn : (i % 5 === 1 ? labelled : spine));
        n++;
      }
    }
    addCollider(cx, z, 5.2, 0.9);
  }
  carts.count = n;
  carts.instanceMatrix.needsUpdate = true;
  if (carts.instanceColor) carts.instanceColor.needsUpdate = true;
  boards.count = boardN;
  boards.instanceMatrix.needsUpdate = true;
  uprights.count = uprightN;
  uprights.instanceMatrix.needsUpdate = true;

  // the spare cells, on a bench in the open strip at the back
  const benchX = minX + 2.1;
  const benchZ = maxZ - 0.8;
  const bench = new THREE.Group();
  bench.position.set(benchX, 0, benchZ);
  scene.add(bench);
  box(bench, 1.8, 0.08, 0.7, 0, 0.92, 0, MAT.trim);
  for (const x of [-0.8, 0.8]) box(bench, 0.08, 0.92, 0.08, x, 0.46, 0, MAT.case);
  const cells = [];
  for (let i = 0; i < 2; i++) {
    const cell = box(bench, 0.16, 0.22, 0.16, -0.35 + i * 0.42, 1.07, 0, MAT.case);
    cell.material = new THREE.MeshStandardMaterial({
      color: 0x2f7ad6, roughness: 0.6, metalness: 0.3,
    });
    cells.push(cell);
  }
  add({
    id: 'TAPE-CELLS',
    kind: 'cells',
    label: 'Torch cells',
    position: new THREE.Vector3(benchX, 1.0, benchZ),
    mesh: bench.children[0],
    cells,
    remaining: cells.length,
  }, bench);
  addCollider(benchX, benchZ, 1.8, 0.7);

  // one way out and a hunter that can follow you in, so there has to be
  // somewhere to get off the floor
  const hx = maxX - 0.9;
  const hz = maxZ - 1.1;
  const cab = new THREE.Group();
  cab.position.set(hx, 0, hz);
  cab.rotation.y = -Math.PI / 2;
  scene.add(cab);
  const body = box(cab, 1.0, 2.05, 0.66, 0, 1.02, 0, MAT.case);
  box(cab, 1.04, 0.06, 0.7, 0, 2.06, 0, MAT.trim);
  for (const side of [-1, 1]) {
    box(cab, 0.48, 1.9, 0.04, side * 0.25, 1.02, 0.34, MAT.trim);
  }
  hideSpot(
    {
      id: 'HIDE-CAB-ARCHIVE',
      kind: 'hide',
      label: 'Media Cabinet',
      position: new THREE.Vector3(hx, 1.1, hz),
      mesh: body,
    },
    {
      root: cab,
      under: false,
      camera: new THREE.Vector3(hx, 1.24, hz),
      exit: new THREE.Vector3(hx - 1.15, 0, hz),
      yaw: Math.PI / 2,
      arc: 0.75,
    },
  );
  addCollider(hx, hz, 0.66, 1.0);

  return door;
}

export function updateFans(fans, dt, running = true) {
  for (const fan of fans) {
    fan.mesh.rotation.z += (running ? fan.speed : 0) * dt;
  }
}
