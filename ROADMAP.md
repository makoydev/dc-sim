# Roadmap

Where this could go next, and what it would cost. Nothing here is committed
work — it is a menu, roughly ordered so the cheap things that make the game
feel better come before the expensive things that make it bigger.

Effort is a rough estimate for one person:
**S** = an hour or two · **M** = an evening · **L** = a weekend · **XL** = a project.

---

## Shipped

- **1.1 Focus brackets.** Corner brackets now draw around whatever the
  crosshair resolves to, cyan when you can act and amber when something is
  blocking you, so the hall reads as touchable before a prompt appears.
  (`highlight.js`)
- **1.2 Pickable list.** The interaction raycast tested every mesh in the scene
  each frame; it now tests a registered list of 95 meshes out of the ~630
  objects in the scene. Props carry one invisible hitbox covering their whole
  footprint, so looking anywhere on a CRAC — grille, display, fan — picks the
  unit. (`pickables.js`, `interaction.js`)
- **Even lighting.** A fixed-step fixture loop left a 6 m gap in front of the
  CRAC wall, so the east side sat about seven times darker than the aisles. The
  grid is now spread evenly wall to wall, with a wall wash down both equipment
  walls; the spread across working areas is 2.9x, down from 7.3x. Added
  `npm run lights`, which samples the real light plan at the spots a player
  stands so this can be judged without a screenshot. (`world.js`,
  `tools/light-check.mjs`)
- **1.7 Screen repaints on demand.** Eleven canvas-backed displays were
  repainting on the same 4 Hz timer regardless of where the player was. They
  now repaint only within 14 m and roughly in front of you. (`game.js`)
- **4.1 Instanced racks.** 72 racks were 288 meshes; they are now four
  `InstancedMesh` draws plus one invisible hitbox each for picking, and the
  status LEDs are a single instanced colour buffer. Fan blades got the same
  treatment. Draw calls went 594 → 269. (`racks.js`, `props.js`)
- **4.6 Light budget.** A zero-intensity light still costs a full evaluation
  per fragment, so night mode was paying for 26 fittings it had "switched
  off". Lights now toggle `visible`, and the day grid dropped from 20 fittings
  to 12 stronger ones — evenness actually improved, 2.9x → 2.0x. Day runs 16
  lights, night 7. (`world.js`)
- **Adaptive resolution.** `devicePixelRatio` 2 meant shading four times the
  fragments, each looping every light. The ratio is capped at 1.5 and a
  governor drops it when frames fall below 45 fps, restoring it only after six
  seconds of headroom. MSAA is off. Added `npm run perf` as a draw-call and
  light budget, and F3 for live stats. (`perf.js`, `tools/perf-check.mjs`)
- **6.7 Day shift as the on-ramp.** The wall-of-text briefing is gone. The day
  shift now teaches through ten one-shot contextual hints that fire when you
  first hit the situation they describe, and the menu frames day as the place
  to start. (`coach.js`)
- **2.9 → Cold Aisle, the whole night shift.** Night lighting, a battery torch, a
  presence director, the entity, hiding places, and Ramos on the radio. That
  is its own design doc — see [HORROR.md](./HORROR.md), whose build order is
  complete.
- **Light as a resource.** The emergency rig now runs off the UPS bank, so the
  night has a light budget: six fittings shed one at a time as it drains, and
  self-testing a cabinet — which nothing on the checklist asks you to do — buys
  the capacity back. An untested bank is down to its last light two thirds in;
  a tested one still has four burning at the end. `npm run lights` samples the
  drain so it can be tuned as numbers. (`world.js`, `game.js`, HORROR.md §5)
- **The camera loop.** The NOC thermal map is now the building's only camera:
  a live cold spot at night, plus a four-minute recording of both your track
  and its that can be played back at the desk. Finishes on how close it got
  while you had your back turned. (`game.js`, HORROR.md §4a)
- **1.8 Pause on blur.** Was already true when the roadmap claimed otherwise:
  the loop gates every system on `player.locked` (`main.js:196`) and losing
  pointer lock raises the pause overlay, so the shift clock does stop.

---

## 1. Known rough edges

These are the things I would fix before adding anything new. Numbering is
stable: shipped items move to the section above and their numbers are not
reused.

| # | Issue | Where | Effort |
| --- | --- | --- | --- |
| 1.3 | No shadows at all, so racks feel like they float. One shadow-casting light per aisle, or a cheap baked contact-shadow decal under each cabinet, adds a lot of grounding for very little. | `world.js:buildLighting` | M |
| 1.4 | Tuning constants are scattered across modules (`SHIFT_SECONDS`, `INCIDENT_GAP` in `game.js`; `WALK`/`SPRINT`/`EYE` in `player.js`; `RANGE` in `interaction.js`). Pull them into one `config.js` so difficulty can be tuned — and eventually chosen by the player — in one place. | new `src/config.js` | S |
| 1.5 | Incidents use bare `Math.random()`, so no two shifts can be compared and the smoke test is non-deterministic. A seeded PRNG gives reproducible runs, regression tests, and shareable "shift seeds". | `tasks.js:rollIncident`, `game.js` | S |
| 1.6 | The walkthrough waypoints are hardcoded in `AISLES` and will silently drift if the rack layout in `racks.js:ROWS` changes. Derive them from the row definitions instead. | `tasks.js`, `racks.js` | S |
| 1.9 | Mouse sensitivity is a hardcoded `0.0022` with no way to change it, and there is no invert-Y. | `player.js`, settings UI | S |
| 1.10 | Nothing persists — no `localStorage` anywhere. No settings, no best score, and "start another shift" is a `location.reload()`. It is also what blocks the other half of HORROR.md §5, where a day-shift self-test pays off at night. | `main.js`, new `src/save.js` | M |

---

## 2. Gameplay depth

The current loop is *read ticket → fetch part → fix → dispose*. These add
decisions on top of it.

- **2.1 Concurrent-pressure incidents (M).** Right now tickets arrive on a fixed
  55–105 s cadence and never interact. Make a tripped CRAC raise the odds of a
  thermal drive failure in the same zone, so ignoring a P1 visibly cascades.
  Hooks already exist: every rack knows its `crac`.
- **2.2 A carried DCIM tablet (M).** Press `Q` to raise a tablet showing the hall
  map, your position, ticket list and rack detail. Replaces the HUD checklist
  with something diegetic, and gives a natural home for a minimap. The `Screen`
  class already renders in-world canvases; the same painter works on a held mesh.
- **2.3 Real work orders (M).** Multi-step tickets with their own sub-checklists —
  *label the drive, photograph the serial, RMA it, update the CMDB* — instead of
  a single hold-E. Task objects already carry a `stage` field, used today only
  by the drive swap.
- **2.4 Raised-floor tiles (L).** A tile puller in the spares cage, liftable floor
  tiles, and airflow that actually depends on which perforated tiles are open.
  Turns hot spots into a spatial puzzle rather than a timer.
- **2.5 Cable management minigame (M).** Route a patch cable through trays between
  two racks; sloppy routing costs airflow and shows up on the thermal map later.
- **2.6 Change windows (M).** Scheduled work — a firmware update, a rack install —
  that must happen inside a time window and blocks other work while it runs.
- **2.7 Escalation and vendor calls (M).** Some faults you cannot fix: you log them,
  call the vendor, and manage the wait while everything else continues.
- **2.8 Badge access and safety procedures (S–M).** ESD strap before touching a
  rack, lockout/tagout before opening a PDU. Skipping them is faster and
  occasionally very expensive — an honest source of risk/reward.
- **2.9 Capacity planning (L).** Install new racks, balance power draw across
  feeds, and get scored on how much headroom you left.

---

## 3. Simulation fidelity

The thermal model is deliberately crude: one CRAC per rack by nearest-Z, and a
first-order approach to a target temperature (`game.js:_updateThermals`).

- **3.1 Zone-based airflow (M).** Model cold-aisle supply temperature per zone
  rather than per rack, with racks drawing from the zone and dumping into a hot
  aisle. Makes containment and blanking panels meaningful.
- **3.2 PUE as a live score (M).** Total facility power ÷ IT power, displayed on the
  NOC wall. Suddenly overcooling the hall is a *mistake* rather than a free win,
  which is the single most authentic pressure in the job.
- **3.3 Humidity and leak detection (S).** Under-floor water sensors, a humidifier
  to keep in band; cheap to add, and a good excuse for a new alarm type.
- **3.4 Real power topology (L).** A/B feeds, per-rack PDU draw, and breaker
  capacities that trip when you overload them — so a breaker trip becomes
  something you *caused*, not something rolled at you.
- **3.5 Generator and fuel (M).** Utility failure → UPS carries the load → genset
  starts → fuel burns down. A dramatic set piece the hall is already wired for
  (`ups.onBattery` exists today).
- **3.6 Battery ageing across shifts (S).** UPS runtime degrades if self-tests are
  skipped, which gives the routine checklist real consequences.

---

## 4. Rendering and performance

Currently ~300 draw calls of unmerged boxes, no instancing, no post-processing.

- **4.2 Post-processing pass (M).** Subtle bloom on the LEDs and screens, and a
  vignette. This is the single biggest visual-payoff-per-hour change available.
- **4.3 Screen-space ambient occlusion (M).** Or, much cheaper, a darkened decal
  under each cabinet — see 1.3.
- **4.4 Level of detail (S).** Racks past ~20 m do not need front-panel textures.
- **4.5 Quality presets (S).** Low/medium/high toggling pixel ratio, shadow and
  post-processing, since this needs to run on laptops.
- **4.7 A build step (M).** Vendoring `three.module.js` keeps the project
  dependency-free and hostable from any static directory, but it ships ~2 MB
  uncompressed. A bundler with tree-shaking would cut that hard. Worth doing
  only when the download size actually matters.

---

## 5. Audio

`audio.js` synthesises everything — no asset files — but it is all
non-positional.

- **5.1 Positional audio (S).** `THREE.PositionalAudio` on each CRAC so the hall
  hum swells as you walk past. The cheapest big immersion win in the list.
- **5.2 Fault-specific sounds (S).** A dying fan whining, a UPS alarm that gets
  louder the longer it is ignored.
- **5.3 Radio chatter (M).** Short synthesised or recorded lines from the NOC when
  tickets are raised and closed, so you feel like part of a team.
- **5.4 A mute/volume control (S).** Currently there is no way to turn the hum off.

---

## 6. UX and accessibility

- **6.1 Key rebinding + sensitivity slider (M).** WASD is hardcoded in
  `player.js`; it should be a keymap object with a settings screen.
- **6.2 Gamepad support (M).** The controller model maps cleanly onto stick-look
  plus a hold-to-interact button.
- **6.3 Colour-blind safe status (S).** Rack state is currently green/amber/red
  only. Add shape or a blink pattern so status is not colour-only — the same
  applies to the checklist ticks.
- **6.4 Head-bob and motion toggles (S).** The bob in `player.js:_apply` should be
  disableable for motion sensitivity, alongside an FOV slider.
- **6.5 Subtitles for audio cues (S).** Pager beeps and alarms should always have a
  visible counterpart. Mostly true today via the log; make it a guarantee.
- **6.6 A tutorial shift (M).** A scripted first shift that introduces one
  mechanic at a time, instead of the current wall-of-text briefing.
- **6.7 Mobile / touch (L).** Virtual sticks and tap-to-interact. Real work, and
  only worth it if people ask.

---

## 7. Architecture

The code is deliberately plain ES modules with no framework. It holds fine at
~2.5k lines; here is where it would start to strain.

- **7.1 Data-driven tasks (M).** Task behaviour currently lives in a `switch` over
  `kind` inside `game.js:_stationAction` and `_rackAction`. Moving each task
  type into its own descriptor — *what it needs, where it happens, how long the
  hold is, what it mutates* — would let new incident types be added without
  touching the game loop. This is the change that unlocks most of section 2.
- **7.2 Split `game.js` (M).** It is by far the largest module and currently owns
  the clock, thermals, incidents, interaction resolution, HUD refresh, screen
  painting and scoring. Thermals and screen painting are the obvious first
  extractions.
- **7.3 An event bus (S).** `hud.say(...)` calls are sprinkled through the game
  logic. Emitting events and letting the HUD subscribe would keep simulation
  and presentation apart, and makes achievements or a replay log trivial later.
- **7.4 Save/persistence (M).** `localStorage` for settings, best scores, and a
  career mode where the facility's condition carries between shifts.
- **7.5 TypeScript (L).** The task and station objects are loose bags of optional
  fields (`rack`, `crac`, `pdu`, `ups`, `visited`, `stage`). Types would catch
  the class of bug the smoke test currently has to find by brute force.

---

## 8. Testing

`npm test` builds the whole hall under a stubbed DOM, plays a full shift,
fires every reachable interaction, and asserts the shift produced a sane
report. It is a smoke test, not a suite.

- **8.1 Deterministic seeds (S).** Depends on 1.5. Lets a failing shift be replayed.
- **8.2 Unit tests for scoring and thermals (S).** Grade boundaries and uptime
  drain are pure functions of state and easy to pin down.
- **8.3 A "chaos" run (S).** Roll incidents far faster than normal and assert the
  simulation never NaNs, deadlocks, or leaves an unresolvable task.
- **8.4 Real browser tests (M).** Playwright with a WebGL-capable headless Chrome,
  asserting the canvas renders and pointer lock engages. This is the gap the
  current test cannot cover.
- **8.5 A performance budget (S).** Fail CI if scene draw calls or triangle count
  regress past a threshold.

---

## 9. Bigger swings

- **9.1 Multiplayer co-op (XL).** Two engineers on one floor, sharing a ticket
  queue, with voice. The fantasy the job actually has.
- **9.2 Facility builder (XL).** Lay out your own hall — rows, containment,
  cooling topology — then work shifts in it and watch your design decisions
  come back as incidents.
- **9.3 Career mode (L).** Chained shifts with equipment that ages, a budget for
  spares, and consequences that persist. The most value per unit of work of
  anything in this section, because the simulation already tracks the state it
  would need.
- **9.4 Scenario editor (L).** Author a specific bad day — a cooling failure during
  a heatwave, mid-migration — and share it as a seed.

---

## Good first tasks

If someone new wants to pick this up: **5.1** (positional CRAC audio), **1.4**
(central config) and **6.3** (colour-blind safe status) are all small,
self-contained, and each makes the game noticeably better on its own.

## What I would do next

The direction is to keep pushing the horror, so in order:

1. **4.2 post-processing.** Bloom on the LEDs, screens and exit signs, plus a
   vignette. The instancing and the resolution governor bought the frame-rate
   headroom this was waiting on, and it flatters a dark hall more per hour than
   anything else on the list — more so now the hall genuinely goes dark.
2. **The tape library** (HORROR.md §11). A room the day shift never opens. The
   night has nowhere to *go* — there is no genset room to walk to — and this is
   the answer, but it is real geometry and belongs after the above.
3. **5.1 positional audio.** Currently the night's central rule, *the fans cover
   you*, is something you are told rather than something you hear. Putting the
   hum on the CRACs makes the masking system legible by ear, which is where it
   should have been all along.

Off to the side, **1.10 persistence** is worth more than its size suggests: it
is what unlocks the other half of §5, where the day shift's UPS self-tests are
what keep the lights on at night.

Bigger question still open: whether this stays a two-shift game that is
finished, or becomes the career mode in 9.3. The simulation already tracks the
state career mode would need, and that decision changes what is worth building
next.
