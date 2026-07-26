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
