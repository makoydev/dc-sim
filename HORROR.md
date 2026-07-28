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

No weapons. Hide and run only. The moment the player can fight back, the hall
stops being frightening.

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
- [ ] 4 — the entity
- [ ] 5 — the partner

---

## 9. Later

- **Co-op.** Two engineers, one ticket queue, one radio. The obvious end state,
  and the reason to keep the sim honest.
- **The tape library.** A room the day shift never opens.
- **Camera review.** Watch back the last ten minutes of the thermal map at the
  NOC and see what walked past you.
