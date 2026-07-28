# Uptime — Data Center Engineer Sim

**Play it: https://makoydev.github.io/dc-sim/** — desktop only (it needs a
keyboard and pointer lock). Runs entirely in the browser; nothing to install.

A small 3D browser game about working a shift on the data hall floor: walk the
aisles, work your checklist, and keep the racks alive until end of shift.

## Run it

```bash
npm install      # only needed to refresh the vendored three.js build
npm start        # serves the folder at http://localhost:5173
```

The game needs to be served over HTTP (ES modules + import maps); opening
`index.html` straight from the filesystem will not work.

## Controls

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` | Move |
| Mouse | Look (click the canvas to capture the pointer) |
| `Shift` | Sprint |
| `E` | Interact |
| `F` | Torch (night shift) |
| `E` | Hide in a cabinet or under a bench (night), `E` again to come out |
| `Tab` | Toggle checklist |
| `Esc` | Release pointer |

## Two shifts

**Day** is the working hall described below. **Night** is the same hall at
22:00 on emergency lighting, worked by torch, with something on the floor that
hunts by sound. The fans cover you while they are running; a cold aisle or a
cabinet will hide you. See [HORROR.md](./HORROR.md).

## The shift

A shift is 13 real minutes, read out as 08:00 → 20:00. You start with a routine
checklist — walk every aisle, log temps at all four CRAC units, self-test the
UPS bank, check the fire panel — and tickets page you on top of that: failed
drives, flapping uplinks, blocked filters, tripped CRACs and breakers, a UPS
dropped to battery.

Parts live in the spares cage and dead hardware goes in the e-waste bin, so most
fixes are a round trip. Anything left open bleeds the uptime SLA, and a blocked
or dead CRAC really does heat the racks in its zone. File the handover at the
NOC desk before 20:00 to close out the shift and get graded.

## Project layout

```
index.html          import map + canvas
src/main.js         bootstrap, overlays, main loop
src/world.js        hall shell, lighting, collider registry
src/racks.js        rack rows and status LEDs
src/props.js        CRACs, UPS bank, PDUs, NOC desk, spares, coffee
src/player.js       first-person controller and AABB collision
src/interaction.js  centre-screen raycast, hold-to-act
src/pickables.js    the mesh list the crosshair is allowed to test
src/highlight.js    focus brackets around the object under the crosshair
src/game.js         shift clock, thermals, incidents, scoring, dashboards
src/tasks.js        checklist definitions and incident rolls
src/ui.js           HUD
src/screen.js       canvas-backed in-world displays
src/textures.js     procedurally drawn materials
src/audio.js        synthesised hum, pagers, footsteps and night sounds
src/torch.js        the hand torch and its battery
src/presence.js     night-shift director — flickers, footsteps, phantom faults
src/entity.js       the thing that hunts by sound, and its aisle nav graph
tools/smoke-test.mjs  headless full-shift run
tools/light-check.mjs samples the light plan at the spots a player stands
vendor/three/       pinned three.js build, so there is no build step
```

## Testing

```bash
npm test
```

Builds the entire hall under a stubbed DOM — no WebGL, no browser — checks that
the crosshair picks the right hardware (and refuses to pick through walls),
plays a whole shift, fires every reachable interaction, and asserts the result
is sane. It catches logic errors, not rendering ones.

```bash
npm run lights
```

Samples the hall's light plan at the spots a player actually stands — the CRAC
faces, the UPS bank, the aisles — and fails if the working areas end up more
than 4x apart. Useful for judging a lighting change without a screenshot.

## What's next

See [ROADMAP.md](./ROADMAP.md) for known rough edges and where this could go.
