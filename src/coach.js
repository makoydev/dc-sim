/**
 * The day shift teaches the hall.
 *
 * Not a scripted tutorial that takes the controls away — a set of one-shot
 * hints that fire when the player first hits the situation they describe. If
 * you already know what you are doing you will trigger three of them and never
 * see the rest, which is the point: the briefing used to be a wall of text
 * nobody read, and this is the same information delivered when it is relevant.
 */

const GAP = 4.5; // seconds between hints, so they never stack up

const LESSONS = [
  {
    id: 'move',
    at: 1.5,
    text: 'W A S D to walk, mouse to look. Esc lets go of the pointer.',
  },
  {
    id: 'checklist',
    at: 7,
    text: 'Your jobs are listed top right. The blue ring points at the next one.',
  },
  {
    id: 'interact',
    when: (g, s) => s.lookingAtAction,
    text: 'Press E to work on something. Bigger jobs need you to hold it.',
  },
  {
    id: 'sprint',
    when: (g) => g.time > 40,
    text: 'Shift sprints. The bar bottom right is how much you have left.',
  },
  {
    id: 'ticket',
    when: (g) => g.openTasks.some((t) => t.dueAt != null),
    text: 'Something broke. Tickets have a countdown — miss it and the SLA drops.',
  },
  {
    id: 'fetch',
    when: (g) => g.openTasks.some((t) => t.need) && !g.carrying,
    text: 'That job needs a part. Follow the marker to the spares cage and take one.',
  },
  {
    id: 'fit',
    when: (g) => Boolean(g.carrying) && g.carrying.key !== 'deadDrive',
    text: 'Now take it to the rack that faulted. Hold E to fit it.',
  },
  {
    id: 'dispose',
    when: (g) => g.carrying?.key === 'deadDrive',
    text: 'Dead hardware goes in the e-waste bin before you can pick anything else up.',
  },
  {
    id: 'heat',
    when: (g) => g.hallTemp > 26,
    text: 'The hall is warming up. Cooling is off somewhere — find it before racks cook.',
  },
  {
    id: 'handover',
    when: (g) => g.tasks.some((t) => t.kind === 'handover' && t.state === 'todo'),
    text: 'Last job: sign the handover at the NOC desk to end the shift.',
  },
];

export class Coach {
  constructor(hud) {
    this.hud = hud;
    this.reset();
  }

  reset() {
    this.done = new Set();
    this.sinceLast = GAP;
    this.enabled = false;
  }

  /** Only the day shift coaches; nights assume you have done a day. */
  start(mode) {
    this.reset();
    this.enabled = mode === 'day';
  }

  update(dt, game, signals) {
    if (!this.enabled) return;
    this.sinceLast += dt;
    if (this.sinceLast < GAP) return;

    for (const lesson of LESSONS) {
      if (this.done.has(lesson.id)) continue;
      const due = lesson.at != null ? game.time >= lesson.at : lesson.when(game, signals);
      if (!due) continue;
      this.done.add(lesson.id);
      this.sinceLast = 0;
      this.hud.coach(lesson.text);
      return;
    }
  }

  get complete() {
    return this.done.size === LESSONS.length;
  }
}

export const COACH_LESSONS = LESSONS;
