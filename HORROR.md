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
  which is nowhere near your tasks. It also *records* — see §4a.
- **The pager.** Your partner's voice. Later, something that is nearly your
  partner's voice.
- **The hum.** Cutting the ambience is the loudest thing this game can do.

---

## 4a. The camera loop

The map has been logging the floor all night whether anyone was watching or
not. Both tracks go into a ring buffer — yours and its — sampled every 1.6
seconds and covering the last four minutes. At the NOC desk you can wind it
back and watch it play through over eleven seconds.

The reason this is worth building is that it is the one piece of information in
the mode that is about the *past*. Everything else — the hum dropping, the LEDs
rolling, the heartbeat — tells you where it is now. The loop tells you where it
was while your back was turned, and finishes on the number that matters:

> **NEAREST 2.4 m** · at 03:41

You already survived that. The loop just tells you by how little.

The trade is deliberate and entirely spatial: the desk is in the north-east
corner, your work is not, the playback pins you there for eleven seconds, and
starting it is a hold that makes noise. It runs on real time — the shift clock,
the heat and the thing on the floor all carry on while you watch.

Two rules that fell out of building it:

- **The handover always wins the desk.** Once there is a shift to sign off, the
  desk is for signing off. A curiosity must never sit in front of the one action
  that ends the night, and a test enforces it.
- **A catch has to clear the playback.** Being caught mid-loop otherwise left
  it permanently "playing", which wedged the desk shut — handover included.
  The one place in this mode where a soft-lock was reachable.

## 4b. The tape archive

The night needed somewhere to *go*. Everything else in the mode happens on the
same floor you already learned by day, and there is deliberately no genset room
to walk to — so the hall is the whole world, and by the back half you have been
round it enough times.

The archive is a room off the south wall. Badged shut on days; by the time you
come on at night it is standing open, and nobody has an explanation for that.

**It has no cooling in it.** That is the entire design. The fan wall is what
covers your noise everywhere else in the building, and it does not reach in
here: masking drops from 0.80 to 0.08 the moment you step through the door.
Every footstep, and every second of a hold-to-work, carries almost in full. It
is the same rule as a tripped CRAC, applied to a whole room and permanently.

**The reason to go in is the spare torch cells.** Two of them, on a bench at
the back. The torch is the only reliable light once the bank starts shedding
zones, and its refills are kept in the quietest, darkest room in the building —
so the thing you need light for is the thing you have to go without light to
get. Nothing asks you to do it and it is on no checklist, exactly like the UPS
self-test.

**Its light is the first thing the bank sheds**, and on an untested bank that
happens twenty-two per cent into the shift — before you are likely to want a
cell. Self-testing the cabinets pushes it out to over halfway. So the two
optional errands in the mode are quietly about each other: the boring one at
22:00 is what buys you a lit archive at 03:00.

One door, no second way out, and the entity can path in. That is why there is a
media cabinet in the back corner to get inside — a dead-end room with a hunter
in it and nowhere to go is not tension, it is a coin flip.

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

### How it was built

One hall-level reserve, drained against a capacity the bank's self-tests set:
`capacity = duration × (0.72 + 0.37 × cabinets tested)`. Seven emergency
fittings, shed one at a time as the reserve falls past 0.70 / 0.58 / 0.46 /
0.34 / 0.22 / 0.12, with the survivors dimming on a curve that stays flat until
the bank is well down. Across the spots you actually stand in, a flat bank is 7x
darker than a full one.

| Cabinets tested | Archive goes dark | Down to one fitting | Ends the shift on |
| --- | --- | --- | --- |
| none | 22% in (00:35) | 63% in (05:36) | 1 of 7, at minimum brightness |
| one | 33% in (01:55) | 96% in (09:30) | 1 of 7 |
| two | 44% in (03:15) | never | 3 of 7 |
| all three | 55% in (04:35) | never | 4 of 7, at 83% |

Four decisions worth keeping:

- **Shedding, not dimming.** An even fade over nine minutes is something nobody
  notices. A fitting going out is an event, and it lands with a line and an
  alarm. It is also honest to the hardware: a UPS under strain drops
  non-critical load rather than browning out everything equally.
- **What survives points at the door.** The shed order works inward from the
  far corners, and the fitting over the north exit is not on the list at all.
  However bad it gets there is one light and two signs, so the hall never stops
  being navigable — the torch stays a choice rather than a requirement.
- **The self-test is not on the checklist.** Nights are two jobs and a
  sign-off, and §7 is emphatic about not adding a third. Instead the cabinets
  simply offer the test, and the prompt states the payoff outright — there is
  no coach at night, so that one line is the entire teaching. It is optional,
  loud, stationary work in a fixed corner of the floor, which makes it a real
  decision rather than an errand.
- **The first shed arrives while you can still act on it.** On an untested bank
  it lands 27% in, with two thirds of the shift left. Warning a player about a
  resource after the point they could do anything about it is just punishment.

The cabinet screens are the only readout: at night `BATT %` stops being a
trickle charge and becomes the countdown, and testing a cabinet visibly lifts
both the number and the hall. There is no HUD element for any of this, on
purpose — §7 again.

**Still missing:** the half that needs persistence. The doc's original pitch was
that self-tests *on the day shift* pay off at night, which no amount of work
inside `game.js` can deliver while each shift is a fresh page load. What shipped
is the self-contained version.

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
- [x] 5 — the partner: twelve radio lines, the silence, and what answers after
- [x] 6 — light as a resource: the emergency rig on the UPS bank, shedding
      fittings as it drains, and a self-test nobody asks you for that buys it
      back (§5)
- [x] 7 — the camera loop: the thermal map as the building's only camera, live
      and recorded, read from the one desk that is nowhere near your work (§4a)
- [x] 8 — the tape archive: a room with no cooling in it, the torch cells at
      the back of it, and one way out (§4b)

The build order is finished.

---

## 8a. Ramos

Twelve radio lines across the shift, driven by shift progress rather than a
timer so the pacing holds whatever the shift length is set to. Four movements:

1. **He is fine, and bored.** Diesel, the blank fuel log, checking in on you.
2. **Something is off.** *"Did you just come through the west door?"* — then
   *"Alright. Then who opened it."*
3. **It goes wrong,** and the channel goes open with nobody keying it.
4. **It comes back** — and what comes back is stitched out of things he said
   in the first movement, word for word. The last line invites you downstairs.

The echo is the whole device, and a test enforces it: every line after the
silence must appear verbatim inside a line from before it, so nobody can later
write "creepy" new dialogue for that section and lose the effect.

It is never resolved. There is no genset room to walk to, no body, no reveal.
He is either a man who stopped answering or the reason the hall stopped being
empty, and the shift report only says *"did not clock out"*.

Mechanically, radio traffic after the silence nudges the entity: it does not
learn where you are, but it stops patrolling and starts searching. The channel
being open is itself a noise.

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
- **The night shift is 9 minutes, the day shift 13.** Dread does not survive
  thirteen minutes; the back half was where it turned into chores. Every
  timing in the game now derives from `Game#duration` rather than a constant,
  which also caught a real bug — being caught clamps the clock to the shift
  length, and with two different lengths that clamp could wind time backwards.
- **Night drops the disposal errand.** Fetch a part, fit it, done. The trip to
  the e-waste bin is realism that costs tension; days still keep it.
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
- **The first pass at the light budget was unreadable as a choice.** Testing
  all three cabinets bought about 15% more runtime, which came out as one extra
  fitting at the end — indistinguishable from noise. The per-test step went up
  more than threefold. If a mechanic is optional and costs a walk across the
  hall, the reward has to be obvious from across the hall too.
- **A long collider is not a big collider.** Player collision resolved one axis
  at a time and chose which side to push you out of by which half of the box you
  were in. That is fine for a rack and very wrong for a six-metre shelf run:
  touching the *front* of one put you level with whichever *end* was nearer, so
  walking into the archive shelving threw you three metres sideways. It had been
  in there the whole time and no hall prop was long enough to show it. Pushing
  out along the nearest face instead has no such failure mode.
- **`npm run lights` now samples the night as well.** The drain is a curve with
  five thresholds on it, and arguing about whether it feels right is much easier
  against a table of numbers than a screenshot. The fixture positions and the
  shed logic are pure functions the tool reads directly, so it cannot drift.

---

## 11. Later

- **Co-op.** Two engineers, one ticket queue, one radio. The obvious end state,
  and the reason to keep the sim honest.
- ~~**The tape library.**~~ Built — see §4b.
- ~~**Camera review.**~~ Built — see §4a.
