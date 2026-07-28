# Uptime — Data Center Engineer Sim

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
| `Tab` | Toggle checklist |
| `Esc` | Release pointer |

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
src/game.js         shift clock, thermals, incidents, scoring, dashboards
src/tasks.js        checklist definitions and incident rolls
src/ui.js           HUD
src/screen.js       canvas-backed in-world displays
src/textures.js     procedurally drawn materials
src/audio.js        synthesised hum, pagers and footsteps
tools/smoke-test.mjs  headless full-shift run
vendor/three/       pinned three.js build, so there is no build step
```

## Testing

```bash
npm test
```

Builds the entire hall under a stubbed DOM — no WebGL, no browser — plays a
whole shift, fires every reachable interaction, and asserts the result is sane.
It catches logic errors, not rendering ones.

## What's next

See [ROADMAP.md](./ROADMAP.md) for known rough edges and where this could go.
