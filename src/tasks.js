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

/** The two enclosed cold aisles — the whole night walkthrough. */
const NIGHT_AISLES = [AISLES[1], AISLES[2]];

const walkTask = (waypoints, title, hint) =>
  task({
    kind: 'walk',
    title,
    hint,
    waypoints,
    targets: waypoints.map((a) => ({ label: a.name, position: a.pos })),
    remaining: waypoints.length,
    total: waypoints.length,
    visited: new Set(),
  });

/**
 * Days are the full round. Nights are two jobs and a signature — with a
 * monster in the building, a five-item checklist in facility jargon stops
 * being tension and becomes homework. Night wording avoids the acronyms on
 * purpose: you should not need to know what a CRAC is to work out where to go.
 */
export function createRoutineTasks(stations, mode = 'day') {
  const cracs = stations.filter((s) => s.kind === 'crac');
  const upses = stations.filter((s) => s.kind === 'ups');
  const vesda = stations.find((s) => s.kind === 'fire');
  const coffee = stations.find((s) => s.kind === 'coffee');

  if (mode === 'night') {
    return [
      walkTask(
        NIGHT_AISLES,
        'Look down both cold aisles',
        'The two closed-in rows in the middle of the hall.',
      ),
      task({
        kind: 'crac-log',
        title: 'Check the four cooling units',
        hint: 'The tall grey units along the far wall.',
        targets: cracs,
        remaining: cracs.length,
        total: cracs.length,
        visited: new Set(),
      }),
    ];
  }

  return [
    task({
      kind: 'coffee',
      title: 'Caffeinate before rounds',
      hint: 'Optional, but the shift is long.',
      optional: true,
      targets: [coffee],
    }),
    walkTask(AISLES, 'Walk every aisle and eyeball the racks'),
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

export function createHandoverTask(noc, mode = 'day') {
  return task({
    kind: 'handover',
    title: mode === 'night'
      ? 'Sign off at the desk by the door'
      : 'File the shift handover at the NOC terminal',
    hint: mode === 'night' ? 'Then you can go home.' : 'Do this before 20:00.',
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
  // same fault, said two ways: the night shift should read like instructions
  const night = world.mode === 'night';
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
        title: night
          ? `Swap the dead drive in rack ${rack.id}`
          : `Replace failed drive — rack ${rack.id}`,
        hint: night
          ? 'Spare drives are on the shelves in the far corner.'
          : 'Grab a spare from the cage first.',
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
        title: night
          ? `Refit the loose cable in rack ${rack.id}`
          : `Uplink flapping — reseat rack ${rack.id}`,
        hint: night
          ? 'Spare cables are on the shelves in the far corner.'
          : 'A fresh patch cable is in the spares cage.',
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
        title: night
          ? `Change the blocked filter on ${crac.label}`
          : `Clogged filter — ${crac.label}`,
        hint: night
          ? 'It is barely cooling until you do. Filters are on the shelves.'
          : 'Cooling output is down until it is changed.',
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
        title: night
          ? `Restart ${crac.label} — it has stopped`
          : `${crac.label} tripped — restart the unit`,
        hint: night
          ? 'That end of the hall is heating up, and going quiet.'
          : 'That zone is heating up right now.',
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
        title: night
          ? `Flip the tripped switch on ${pdu.label}`
          : `${pdu.label} breaker tripped — reset it`,
        hint: night
          ? 'The grey panel on the near wall.'
          : 'Racks on that feed lost a power path.',
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
        title: night
          ? `Put ${ups.label} back on mains power`
          : `${ups.label} on battery — transfer back to mains`,
        hint: night
          ? 'It is running on batteries. They do not last.'
          : 'Runtime is finite. Move.',
        targets: [ups],
        ups,
        dueAt: now + 140,
        severity: 'critical',
      });
    }
  }
}

/** A CRAC that stopped on its own. No page, no ticket number. */
export function createSabotageTask(crac, dueAt) {
  return task({
    kind: 'crac-restart',
    title: `Restart ${crac.label} — it just stopped`,
    hint: 'It was running a minute ago.',
    targets: [crac],
    crac,
    dueAt,
    severity: 'critical',
  });
}

export const ITEMS = {
  drive: { key: 'drive', label: '2.5" spare drive' },
  cable: { key: 'cable', label: 'LC patch cable' },
  filter: { key: 'filter', label: 'CRAC air filter' },
  deadDrive: { key: 'deadDrive', label: 'Failed drive (dispose)' },
  coffee: { key: 'coffee', label: 'Coffee' },
};
