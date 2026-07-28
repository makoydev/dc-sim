# Cold Aisle — the night shift

A horror mode for the same hall. Not a different game: the same racks, the same
checklist, the same thermal sim, at 02:00 with something else on the floor.

The rule this design follows: **the horror comes out of systems that already
exist.** A bolted-on monster turns the work into busywork, and the work is the
best thing this project has.

---

## 1. Premise

You are on nights in hall 3. Your partner goes to check the genset and stops
answering the radio.

The threat stays ambiguous for as long as possible. The grounded reading is
that the inert-gas fire suppression system has a slow leak, oxygen is dropping,
and you cannot fully trust what you are seeing — a real hazard in a real data
hall, and a free unreliable narrator. The other reading is that something is in
here with you. The game should never quite settle it.

Ambiguity is also cheap: an empty hall you have stopped trusting is scarier
than a model you have now seen twice, and it costs almost nothing to build.

---

## 2. Three clocks

Everything hangs off three timers running at once:

1. **The work.** The checklist is still due by 06:00.
2. **The hunt.** Something is looking for you.
3. **The hall.** Heat still rises when cooling is down.

The third is the most important mechanic in the mode. Horror games fall apart
when hiding becomes the optimal play; here the temperature keeps climbing while
you are in the cupboard, and the thermal sim that drives it is already written.
Hiding is always available and never free.

---

## 3. The threat's rules

Players need learnable rules. Fear of an unknowable thing lasts about ten
minutes; fear of a thing whose rules you understand and might still get wrong
lasts the whole shift.

- **It is blind. It hunts sound.** The hall's fan noise is your cover.
- **Close range is not a hearing problem.** Once it is within nine metres and
  already hunting, it has you: it re-paths onto your position every 0.4 s and
  freezing does nothing. Standing still is a tactic at distance, not in its lap.
- **You are never silent.** Breathing carries a little every 1.3 seconds, so a
  player who simply stops moving is quieter, not absent.
- **When a CRAC trips, that zone goes quiet** — and you become audible in it.
  A cooling failure now means heat *and* exposure. One existing system, two
  meanings; this is the centre of the design.
- **Sprinting is loud.** The stamina bar becomes a noise budget with no new
  systems at all.
- **Hold-E work is loud and cannot be safely aborted.** A drive swap rattles
  for three seconds. The interaction system already commits you to it.
- **It uses the facility.** It trips breakers and kills zones, so restoring
  power means walking toward it. Your job description is the bait.
- **Cold aisle containment is safe.** The one place it will not follow, which
  finally gives the aisle layout tactical meaning.
- **You can get inside things.** Two storage cabinets and two workbenches. It
  cannot reach you in there and you make no sound while you are still — but the
  door makes a noise on the way in, so hiding at the last second buys nothing.

No weapons. Hide and run only. The moment the player can fight back, the hall
stops being frightening.

---

## 3a. What it looks like

Proportions do the work, not gore. Two and a half metres of it, shoulders
narrower than a person's, forearms hanging past the knees, knees that bend
backwards like a bird's, a skull stretched vertically with no face on it. The
only bright thing is two small glints where the torch catches — they warm and
pulse when it is hunting.

Two rules learned by getting it wrong:

- **It must not slide.** The first version was a static figure translating along
  the floor and it read as a bug, not a threat. A procedural walk — legs
  alternating, arms counter-swinging, hips rising slightly on each step, the
  head never quite level — did more for the fear than any amount of geometry.
- **Slightly glossy beats matte black.** At roughness 1 it vanished into the
  dark completely, which sounds right and plays wrong: you never got the moment
  where the torch finds an edge of something before you understand the shape.

It also leans forward when it changes to a chase, which is readable from across
the hall and is usually the last thing you want to see.

---

## 3b. What it sounds like

Sound carries this mode more than the model does.

- **Arrival.** A three-second layered drop when it enters the hall: sawtooth
  partials sliding two octaves down, a filter closing from 2.6 kHz to 220 Hz, a
  metallic band of noise dragged down with them, and a 41 Hz sine underneath.
- **The chase layer.** A sustained tremolo cluster (73.4 / 77.8 / 146.8 Hz —
  deliberately dissonant) that starts the moment it commits to a chase and only
  stops when it loses you. Intensity tracks distance: the filter opens from 240
  to 1140 Hz and the tremolo speeds from 2.6 to 8 Hz as it closes.
- **Heartbeat.** Once it is within nine metres and not merely patrolling, your
  own pulse takes over, from 1.15 s between beats down to 0.42 s.
- **The catch.** The chase layer cuts dead, then a bandpass scream swept down
  from 2.6 kHz over a dissonant pair of sawtooths.
- **Muffling.** Everything runs through a lowpass that drops to 480 Hz while you
  are hidden, so the hall goes dull and close and you cannot hear it as well
  either. Hiding costs you information.

All of it is still synthesised. There are no audio files in this project.

---

## 4. Tells, built from parts already on the floor

- **Rack LEDs.** Racks lose network in a wave as it passes — amber rolling down
  a row gives you direction with no HUD element at all.
- **The NOC thermal map.** Becomes a security camera: a moving cold spot on the
  left monitor. You can see roughly where it is, but only from the NOC desk,
  which is nowhere near your tasks.
- **The pager.** Your partner's voice. Later, something that is nearly your
  partner's voice.
- **The hum.** Cutting the ambience is the loudest thing this game can do.

---

## 5. Light as a resource

The best structural idea in the mode: **emergency lighting runs off the UPS.**

The battery percentage on those cabinets becomes a literal countdown to full
darkness — and the runtime is longer if you ran the UPS self-tests earlier in
the shift. Routine maintenance stops being paperwork and becomes preparation. A
player who did the boring job properly at 22:00 is materially safer at 03:00,
and that retroactively improves the day shift too.

The torch is the other half: battery-limited, and the only reliable light once
the zones start going. Light attracts nothing — it is blind — but light is how
*you* stop walking into things, and the torch battery is a resource you will
resent spending.

---

## 6. Death

Dying should not cost twenty minutes. You wake up in the corridor, an hour of
shift is gone, the hall is hotter, and something has been happening while you
were out. Progress is lost, not the session.

---

## 7. What this costs the sim

The honest risk: horror and a detailed checklist fight each other. Too much
admin and the dread turns into paperwork.

Mitigation: the night checklist trims to three or four meaty tasks, while the
full checklist stays on the day shift. Same hall, two modes — and the day shift
doubles as the tutorial that teaches you the geography you will need in the
dark.

**Confirmed by playtest.** The first person to play this who had not built it
said the checklist was "a lot and too complex". Three things came out of that:

- **Nights run two routine tasks plus the sign-off**, against five by day.
- **Night wording drops the acronyms.** "Log supply/return temps on all CRAC
  units" became "Check the four cooling units"; "Uplink flapping — reseat rack
  C07" became "Refit the loose cable in rack C07". You should not need to know
  what a CRAC is to work out where to go. A test fails the build if a night
  task title contains CRAC, UPS, PDU, VESDA, uplink, reseat, mains or breaker.
- **The HUD shows one objective at a time.** At night the uptime, hall
  temperature and checklist counters are hidden and the list collapses to a
  single line — still a Tab away if you want the whole thing. Eleven HUD
  elements while something hunts you is not tension, it is admin.

---

## 8. Build order

Deliberately back to front. Step 3 before step 4 is the whole trick.

1. **Night mode.** Ceiling grid off, emergency lighting only, torch in hand.
   The lighting config is already centralised for exactly this.
2. **Zoned ambience.** So the hum can drop in one part of the hall.
3. **Presence, with nothing in the hall.** Flickers, a clang two aisles over,
   footsteps that stop when you stop, a fault that appears on a rack you walked
   past a minute ago, a shape on the thermal map that is gone when you look
   again. Nearly free given what is built, and it is most of the effect.
4. **The entity.** Sound-driven, patrolling the aisles, with the rules in §3.
5. **The partner.** Radio, then silence, then something wearing his voice.

### Status

- [x] 1 — night lighting, exit signs, torch with a battery
- [x] 2 — hum that drops when cooling zones go down
- [x] 3 — presence director: flickers, clangs, footsteps, LED waves, phantom
      faults, radio
- [x] 4 — the entity: blind, sound-driven, walks the aisle graph, will not
      enter containment, kills cooling to make you audible
- [x] 4a — hiding places, muffled audio, and a look-arc while you are in them
- [ ] 5 — the partner

---

## 9. Hiding

Four spots: storage cabinets on the west wall and in the south-east corner
(you get inside), workbenches north-west and east (you get under).

While hidden you are frozen in place, your view is clamped to an arc — 0.75
radians in a cabinet, 1.0 under a bench — the screen closes to a slot, and the
audio muffles. You make no noise at all, so the entity loses you within seven
seconds and goes back to investigating. Getting in and out each emits 0.34
noise at the spot, which is the whole balance: hiding early is free, hiding as
it rounds the corner tells it exactly where you went.

Nothing stops the shift clock while you are in there, and the racks keep
heating. That is deliberate — see §2.

---

## 10. Notes from building it

- **A blind hunter still needs to hunt.** The first version reacted only to
  noise events, so a player who stopped walking stopped existing — it would
  halt two metres away and lose interest, which read as broken rather than
  merciful. Lock-on inside nine metres plus a constant breathing emit fixed it,
  and both are now covered by tests that fail if freezing ever works up close.
- **Investigating should be a search.** It used to walk to the last sound and
  stand on the spot. It now casts around nodes within 6.5 m of it.
- **It cannot arrive late.** At 22% of the shift it turned up around three
  minutes in, by which time the player has done a lap of the racks and the
  dread has worn off. It now arrives just under a minute in, and the test
  fails if that ever slips past 90 seconds.
- **Distance is planar.** It walks the floor; the player's position is eye
  height. Comparing full 3D distance meant it could never physically reach
  catch range — it stood on your feet and did nothing.
- **Repath from the node you are walking to, never the nearest one.** A hunter
  that repaths twice a second and starts each path from the nearest node turns
  around before it ever crosses the midpoint between two aisles, and oscillates
  on the spot forever. It looked like a pathfinding bug; it was a framing bug.
- **Containment is checked on the player, not the entity.** Keeping the safe
  zone out of the nav graph entirely is what makes it reliable — it cannot path
  in, so it cannot glitch in.

---

## 11. Later

- **Co-op.** Two engineers, one ticket queue, one radio. The obvious end state,
  and the reason to keep the sim honest.
- **The tape library.** A room the day shift never opens.
- **Camera review.** Watch back the last ten minutes of the thermal map at the
  NOC and see what walked past you.
