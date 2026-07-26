import * as THREE from 'three';

let nextId = 1;

function task(props) {
  return {
    id: `T${nextId++}`,
    state: 'todo',
    need: null,
    dueAt: null,
    severity: 'routine',
    optional: false,
    remaining: 1,
    total: 1,
    ...props,
  };
}

/** Waypoints down the middle of each cold aisle, used by the walkthrough. */
export const AISLES = [
  { name: 'Row A', pos: new THREE.Vector3(0, 0, -9.8) },
  { name: 'Row B/C', pos: new THREE.Vector3(0, 0, -3.7) },
  { name: 'Row D/E', pos: new THREE.Vector3(0, 0, 2.9) },
  { name: 'Row F', pos: new THREE.Vector3(0, 0, 9.2) },
  { name: 'Hot aisle A/B', pos: new THREE.Vector3(-3.5, 0, -7.05) },
  { name: 'Hot aisle E/F', pos: new THREE.Vector3(3.5, 0, 6.15) },
];

export function createRoutineTasks(stations) {
  const cracs = stations.filter((s) => s.kind === 'crac');
  const upses = stations.filter((s) => s.kind === 'ups');
  const vesda = stations.find((s) => s.kind === 'fire');
  const coffee = stations.find((s) => s.kind === 'coffee');

  return [
    task({
      kind: 'coffee',
      title: 'Caffeinate before rounds',
      hint: 'Optional, but the shift is long.',
      optional: true,
      targets: [coffee],
    }),
    task({
      kind: 'walk',
      title: 'Walk every aisle and eyeball the racks',
      targets: AISLES.map((a) => ({ label: a.name, position: a.pos })),
      remaining: AISLES.length,
      total: AISLES.length,
      visited: new Set(),
    }),
    task({
      kind: 'crac-log',
      title: 'Log supply/return temps on all CRAC units',
      targets: cracs,
      remaining: cracs.length,
      total: cracs.length,
      visited: new Set(),
    }),
    task({
      kind: 'ups-test',
      title: 'Run self-test on the UPS bank',
      targets: upses,
      remaining: upses.length,
      total: upses.length,
      visited: new Set(),
    }),
    task({
      kind: 'fire-check',
      title: 'Verify the VESDA panel is clear',
      targets: [vesda],
    }),
  ];
}

export function createHandoverTask(noc) {
  return task({
    kind: 'handover',
    title: 'File the shift handover at the NOC terminal',
    hint: 'Do this before 20:00.',
    targets: [noc],
    severity: 'warning',
  });
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * Rolls a fresh incident against the current world state and mutates the
 * affected hardware. Returns the task to add to the checklist, or null when
 * nothing suitable is broken-able right now.
 */
export function rollIncident(world, now) {
  const { racks, stations } = world;
  const healthyRacks = racks.filter((r) => !r.fault);
  const cracs = stations.filter((s) => s.kind === 'crac' && s.running && !s.filterClogged);
  const pdus = stations.filter((s) => s.kind === 'pdu' && !s.breakerTripped);
  const upses = stations.filter((s) => s.kind === 'ups' && !s.onBattery);

  const options = [];
  if (healthyRacks.length) options.push('drive', 'cable');
  if (cracs.length) options.push('filter', 'crac-trip');
  if (pdus.length) options.push('breaker');
  if (upses.length) options.push('ups-battery');
  if (!options.length) return null;

  switch (pick(options)) {
    case 'drive': {
      const rack = pick(healthyRacks);
      rack.fault = { type: 'drive', severity: 'warning' };
      return task({
        kind: 'drive-swap',
        title: `Replace failed drive — rack ${rack.id}`,
        hint: 'Grab a spare from the cage first.',
        need: 'drive',
        targets: [rack],
        rack,
        dueAt: now + 210,
        severity: 'warning',
      });
    }
    case 'cable': {
      const rack = pick(healthyRacks);
      rack.fault = { type: 'cable', severity: 'warning' };
      return task({
        kind: 'cable-fix',
        title: `Uplink flapping — reseat rack ${rack.id}`,
        hint: 'A fresh patch cable is in the spares cage.',
        need: 'cable',
        targets: [rack],
        rack,
        dueAt: now + 200,
        severity: 'warning',
      });
    }
    case 'filter': {
      const crac = pick(cracs);
      crac.filterClogged = true;
      return task({
        kind: 'filter-swap',
        title: `Clogged filter — ${crac.label}`,
        hint: 'Cooling output is down until it is changed.',
        need: 'filter',
        targets: [crac],
        crac,
        dueAt: now + 260,
        severity: 'warning',
      });
    }
    case 'crac-trip': {
      const crac = pick(cracs);
      crac.running = false;
      return task({
        kind: 'crac-restart',
        title: `${crac.label} tripped — restart the unit`,
        hint: 'That zone is heating up right now.',
        targets: [crac],
        crac,
        dueAt: now + 150,
        severity: 'critical',
      });
    }
    case 'breaker': {
      const pdu = pick(pdus);
      pdu.breakerTripped = true;
      return task({
        kind: 'breaker-reset',
        title: `${pdu.label} breaker tripped — reset it`,
        hint: 'Racks on that feed lost a power path.',
        targets: [pdu],
        pdu,
        dueAt: now + 170,
        severity: 'critical',
      });
    }
    default: {
      const ups = pick(upses);
      ups.onBattery = true;
      return task({
        kind: 'ups-transfer',
        title: `${ups.label} on battery — transfer back to mains`,
        hint: 'Runtime is finite. Move.',
        targets: [ups],
        ups,
        dueAt: now + 140,
        severity: 'critical',
      });
    }
  }
}

export const ITEMS = {
  drive: { key: 'drive', label: '2.5" spare drive' },
  cable: { key: 'cable', label: 'LC patch cable' },
  filter: { key: 'filter', label: 'CRAC air filter' },
  deadDrive: { key: 'deadDrive', label: 'Failed drive (dispose)' },
  coffee: { key: 'coffee', label: 'Coffee' },
};
