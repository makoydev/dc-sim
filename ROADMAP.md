# Roadmap

Where this could go next, and what it would cost. Nothing here is committed
work — it is a menu, roughly ordered so the cheap things that make the game
feel better come before the expensive things that make it bigger.

Effort is a rough estimate for one person:
**S** = an hour or two · **M** = an evening · **L** = a weekend · **XL** = a project.

---

## 1. Known rough edges

These are the things I would fix before adding anything new.

| # | Issue | Where | Effort |
| --- | --- | --- | --- |
| 1.1 | Nothing highlights when you look at it — you only learn a thing is interactive from the prompt text. An emissive outline or rim-light on the focused object would make the hall read as touchable. | `interaction.js` (`_pick` already returns the target), `racks.js` | S |
| 1.2 | The interaction raycast tests **every** mesh in the scene each frame (`intersectObjects(scene.children, true)`). Keep a flat array of interactive meshes and raycast only that. | `interaction.js:_pick` | S |
| 1.3 | No shadows at all, so racks feel like they float. One shadow-casting light per aisle, or a cheap baked contact-shadow decal under each cabinet, adds a lot of grounding for very little. | `world.js:buildLighting` | M |
| 1.4 | Tuning constants are scattered across modules (`SHIFT_SECONDS`, `INCIDENT_GAP` in `game.js`; `WALK`/`SPRINT`/`EYE` in `player.js`; `RANGE` in `interaction.js`). Pull them into one `config.js` so difficulty can be tuned — and eventually chosen by the player — in one place. | new `src/config.js` | S |
| 1.5 | Incidents use bare `Math.random()`, so no two shifts can be compared and the smoke test is non-deterministic. A seeded PRNG gives reproducible runs, regression tests, and shareable "shift seeds". | `tasks.js:rollIncident`, `game.js` | S |
| 1.6 | The walkthrough waypoints are hardcoded in `AISLES` and will silently drift if the rack layout in `racks.js:ROWS` changes. Derive them from the row definitions instead. | `tasks.js`, `racks.js` | S |
| 1.7 | Every CRAC/UPS screen repaints on the same 4 Hz timer whether or not the player can see it. Skip repaints for screens outside the frustum or beyond ~12 m. | `game.js:_updateScreens` | S |
| 1.8 | No pause-on-blur. Alt-tab away mid-shift and the clock keeps running (the SLA does not). | `main.js` | S |
| 1.9 | Mouse sensitivity is a hardcoded `0.0022` with no way to change it, and there is no invert-Y. | `player.js`, settings UI | S |

---

## 2. Gameplay depth

The current loop is *read ticket → fetch part → fix → dispose*. These add
decisions on top of it.

- **Concurrent-pressure incidents (M).** Right now tickets arrive on a fixed
  55–105 s cadence and never interact. Make a tripped CRAC raise the odds of a
  thermal drive failure in the same zone, so ignoring a P1 visibly cascades.
  Hooks already exist: every rack knows its `crac`.
- **A carried DCIM tablet (M).** Press `Q` to raise a tablet showing the hall
  map, your position, ticket list and rack detail. Replaces the HUD checklist
  with something diegetic, and gives a natural home for a minimap. The `Screen`
  class already renders in-world canvases; the same painter works on a held mesh.
- **Real work orders (M).** Multi-step tickets with their own sub-checklists —
  *label the drive, photograph the serial, RMA it, update the CMDB* — instead of
  a single hold-E. Task objects already carry a `stage` field, used today only
  by the drive swap.
- **Raised-floor tiles (L).** A tile puller in the spares cage, liftable floor
  tiles, and airflow that actually depends on which perforated tiles are open.
  Turns hot spots into a spatial puzzle rather than a timer.
- **Cable management minigame (M).** Route a patch cable through trays between
  two racks; sloppy routing costs airflow and shows up on the thermal map later.
- **Change windows (M).** Scheduled work — a firmware update, a rack install —
  that must happen inside a time window and blocks other work while it runs.
- **Escalation and vendor calls (M).** Some faults you cannot fix: you log them,
  call the vendor, and manage the wait while everything else continues.
- **Badge access and safety procedures (S–M).** ESD strap before touching a
  rack, lockout/tagout before opening a PDU. Skipping them is faster and
  occasionally very expensive — an honest source of risk/reward.
- **Night shift / on-call variant (M).** Darker hall, skeleton lighting, fewer
  routine tasks, worse incidents, and a phone that wakes you up.
- **Capacity planning (L).** Install new racks, balance power draw across
  feeds, and get scored on how much headroom you left.

---

## 3. Simulation fidelity

The thermal model is deliberately crude: one CRAC per rack by nearest-Z, and a
first-order approach to a target temperature (`game.js:_updateThermals`).

- **Zone-based airflow (M).** Model cold-aisle supply temperature per zone
  rather than per rack, with racks drawing from the zone and dumping into a hot
  aisle. Makes containment and blanking panels meaningful.
- **PUE as a live score (M).** Total facility power ÷ IT power, displayed on the
  NOC wall. Suddenly overcooling the hall is a *mistake* rather than a free win,
  which is the single most authentic pressure in the job.
- **Humidity and leak detection (S).** Under-floor water sensors, a humidifier
  to keep in band; cheap to add, and a good excuse for a new alarm type.
- **Real power topology (L).** A/B feeds, per-rack PDU draw, and breaker
  capacities that trip when you overload them — so a breaker trip becomes
  something you *caused*, not something rolled at you.
- **Generator and fuel (M).** Utility failure → UPS carries the load → genset
  starts → fuel burns down. A dramatic set piece the hall is already wired for
  (`ups.onBattery` exists today).
- **Battery ageing across shifts (S).** UPS runtime degrades if self-tests are
  skipped, which gives the routine checklist real consequences.

---

## 4. Rendering and performance

Currently ~300 draw calls of unmerged boxes, no instancing, no post-processing.

- **Instance the racks (M).** 72 racks × 4 meshes is the bulk of the scene.
  `InstancedMesh` for frames and panels, with per-instance colour for LEDs,
  would cut draw calls by an order of magnitude and leave headroom for a much
  bigger hall.
- **Post-processing pass (M).** Subtle bloom on the LEDs and screens, and a
  vignette. This is the single biggest visual-payoff-per-hour change available.
- **Screen-space ambient occlusion (M).** Or, much cheaper, a darkened decal
  under each cabinet — see 1.3.
- **Level of detail (S).** Racks past ~20 m do not need front-panel textures.
- **Quality presets (S).** Low/medium/high toggling pixel ratio, shadow and
  post-processing, since this needs to run on laptops.
- **A build step (M).** Vendoring `three.module.js` keeps the project
  dependency-free and hostable from any static directory, but it ships ~2 MB
  uncompressed. A bundler with tree-shaking would cut that hard. Worth doing
  only when the download size actually matters.

---

## 5. Audio

`audio.js` synthesises everything — no asset files — but it is all
non-positional.

- **Positional audio (S).** `THREE.PositionalAudio` on each CRAC so the hall
  hum swells as you walk past. The cheapest big immersion win in the list.
- **Fault-specific sounds (S).** A dying fan whining, a UPS alarm that gets
  louder the longer it is ignored.
- **Radio chatter (M).** Short synthesised or recorded lines from the NOC when
  tickets are raised and closed, so you feel like part of a team.
- **A mute/volume control (S).** Currently there is no way to turn the hum off.

---

## 6. UX and accessibility

- **Key rebinding + sensitivity slider (M).** WASD is hardcoded in
  `player.js`; it should be a keymap object with a settings screen.
- **Gamepad support (M).** The controller model maps cleanly onto stick-look
  plus a hold-to-interact button.
- **Colour-blind safe status (S).** Rack state is currently green/amber/red
  only. Add shape or a blink pattern so status is not colour-only — the same
  applies to the checklist ticks.
- **Head-bob and motion toggles (S).** The bob in `player.js:_apply` should be
  disableable for motion sensitivity, alongside an FOV slider.
- **Subtitles for audio cues (S).** Pager beeps and alarms should always have a
  visible counterpart. Mostly true today via the log; make it a guarantee.
- **A tutorial shift (M).** A scripted first shift that introduces one
  mechanic at a time, instead of the current wall-of-text briefing.
- **Mobile / touch (L).** Virtual sticks and tap-to-interact. Real work, and
  only worth it if people ask.

---

## 7. Architecture

The code is deliberately plain ES modules with no framework. It holds fine at
~2.5k lines; here is where it would start to strain.

- **Data-driven tasks (M).** Task behaviour currently lives in a `switch` over
  `kind` inside `game.js:_stationAction` and `_rackAction`. Moving each task
  type into its own descriptor — *what it needs, where it happens, how long the
  hold is, what it mutates* — would let new incident types be added without
  touching the game loop. This is the change that unlocks most of section 2.
- **Split `game.js` (M).** It is by far the largest module and currently owns
  the clock, thermals, incidents, interaction resolution, HUD refresh, screen
  painting and scoring. Thermals and screen painting are the obvious first
  extractions.
- **An event bus (S).** `hud.say(...)` calls are sprinkled through the game
  logic. Emitting events and letting the HUD subscribe would keep simulation
  and presentation apart, and makes achievements or a replay log trivial later.
- **Save/persistence (M).** `localStorage` for settings, best scores, and a
  career mode where the facility's condition carries between shifts.
- **TypeScript (L).** The task and station objects are loose bags of optional
  fields (`rack`, `crac`, `pdu`, `ups`, `visited`, `stage`). Types would catch
  the class of bug the smoke test currently has to find by brute force.

---

## 8. Testing

`npm test` builds the whole hall under a stubbed DOM, plays a full shift,
fires every reachable interaction, and asserts the shift produced a sane
report. It is a smoke test, not a suite.

- **Deterministic seeds (S).** Depends on 1.5. Lets a failing shift be replayed.
- **Unit tests for scoring and thermals (S).** Grade boundaries and uptime
  drain are pure functions of state and easy to pin down.
- **A "chaos" run (S).** Roll incidents far faster than normal and assert the
  simulation never NaNs, deadlocks, or leaves an unresolvable task.
- **Real browser tests (M).** Playwright with a WebGL-capable headless Chrome,
  asserting the canvas renders and pointer lock engages. This is the gap the
  current test cannot cover.
- **A performance budget (S).** Fail CI if scene draw calls or triangle count
  regress past a threshold.

---

## 9. Bigger swings

- **Multiplayer co-op (XL).** Two engineers on one floor, sharing a ticket
  queue, with voice. The fantasy the job actually has.
- **Facility builder (XL).** Lay out your own hall — rows, containment,
  cooling topology — then work shifts in it and watch your design decisions
  come back as incidents.
- **Career mode (L).** Chained shifts with equipment that ages, a budget for
  spares, and consequences that persist. The most value per unit of work of
  anything in this section, because the simulation already tracks the state it
  would need.
- **Scenario editor (L).** Author a specific bad day — a cooling failure during
  a heatwave, mid-migration — and share it as a seed.

---

## Good first tasks

If someone new wants to pick this up: **1.1** (highlight what you are looking
at), **5.1** (positional CRAC audio), **1.4** (central config), and **6.3**
(colour-blind safe status) are all small, self-contained, and each makes the
game noticeably better on its own.
