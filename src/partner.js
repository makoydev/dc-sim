/**
 * Ramos.
 *
 * He is on the genset walk, he is on the radio, and then he is not. The arc
 * runs on shift progress rather than a timer, so it stays in step however long
 * a shift is set to.
 *
 * Nothing here is ever confirmed. He is either a man who stopped answering, or
 * the reason the hall stopped being empty, and the game does not say which.
 */

const PHASES = [
  // --- he is fine, and slightly bored ------------------------------------
  { at: 0.04, kind: 'ok', text: 'RAMOS: Genset room. Smells like diesel and regret down here.' },
  { at: 0.11, kind: 'ok', text: 'RAMOS: Day crew left the fuel log blank again. Course they did.' },
  { at: 0.19, kind: 'ok', text: "RAMOS: You good up there? Hall's quiet on the cameras." },

  // --- something is off ---------------------------------------------------
  { at: 0.27, kind: 'odd', text: 'RAMOS: Hey — did you just come through the west door?' },
  { at: 0.33, kind: 'odd', text: 'RAMOS: Alright. Then who opened it.' },
  { at: 0.41, kind: 'odd', text: "RAMOS: I'm going to walk it back. Stay on channel." },

  // --- it goes wrong ------------------------------------------------------
  { at: 0.5, kind: 'bad', text: 'RAMOS: There is something in the north aisle.' },
  { at: 0.55, kind: 'bad', text: 'RAMOS: Do not — do not use the radio. It hears the—' },
  { at: 0.6, kind: 'silence', text: 'The channel goes open. Nobody keys it.' },

  // --- and then it comes back --------------------------------------------
  // word for word what he said at 0.19, which is the tell
  { at: 0.72, kind: 'wrong', text: 'RAMOS: ...you good up there?' },
  { at: 0.81, kind: 'wrong', text: "RAMOS: Hall's quiet on the cameras." },
  { at: 0.89, kind: 'wrong', text: 'RAMOS: Come down to the genset room. I am fine.' },
];

export class Partner {
  constructor({ hud, audio, entity }) {
    this.hud = hud;
    this.audio = audio;
    this.entity = entity;
    this.next = 0;
    this.lost = false;
  }

  reset() {
    this.next = 0;
    this.lost = false;
  }

  update(progress) {
    const line = PHASES[this.next];
    if (!line || progress < line.at) return;
    this.next++;
    this._say(line);
  }

  _say(line) {
    const { kind, text } = line;

    if (kind === 'silence') {
      this.lost = true;
      this.audio?.radioStatic(2.4);
      this.hud.say(text, 'bad');
      return;
    }

    this.audio?.radioStatic(kind === 'wrong' ? 1.1 : 0.6);
    this.hud.say(text, kind === 'ok' ? '' : kind === 'odd' ? 'warn' : 'bad');

    // after the channel dies, anything on it draws the thing towards the sound
    if (kind === 'wrong') {
      this.audio?.whisper(0);
      this.entity?.onRadio?.();
    }
  }

  /** True once he has stopped being himself — used by the shift report. */
  get compromised() {
    return this.next > PHASES.findIndex((p) => p.kind === 'silence');
  }
}

export const PARTNER_LINES = PHASES;
