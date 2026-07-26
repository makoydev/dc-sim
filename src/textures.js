import * as THREE from 'three';

function canvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function finish(c, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Perforated raised-floor tile, 600mm grid. */
export function floorTexture(repeat = 26) {
  const [c, g] = canvas(128);
  g.fillStyle = '#1a2027';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#232b34';
  g.fillRect(4, 4, 120, 120);

  // perforation dots
  g.fillStyle = '#0d1116';
  for (let y = 16; y < 120; y += 12) {
    for (let x = 16; x < 120; x += 12) {
      g.beginPath();
      g.arc(x, y, 2.4, 0, Math.PI * 2);
      g.fill();
    }
  }
  // tile seam highlight
  g.strokeStyle = 'rgba(255,255,255,0.06)';
  g.lineWidth = 2;
  g.strokeRect(5, 5, 118, 118);
  return finish(c, repeat, repeat);
}

/** Front of a rack: stacked 1U servers with vents and status LEDs. */
export function rackFrontTexture() {
  const [c, g] = canvas(256);
  g.fillStyle = '#0b0e12';
  g.fillRect(0, 0, 256, 256);

  const unit = 256 / 21;
  for (let i = 0; i < 21; i++) {
    const y = i * unit;
    const empty = i % 9 === 8;
    g.fillStyle = empty ? '#12161b' : i % 2 ? '#1f252c' : '#232a32';
    g.fillRect(6, y + 1, 244, unit - 2);
    if (empty) continue;

    // vent grille
    g.fillStyle = 'rgba(0,0,0,0.55)';
    for (let x = 40; x < 210; x += 6) g.fillRect(x, y + 3, 3, unit - 6);

    // handles
    g.fillStyle = '#39424c';
    g.fillRect(10, y + 3, 8, unit - 6);
    g.fillRect(238, y + 3, 8, unit - 6);

    // status LEDs
    g.fillStyle = i % 5 === 0 ? '#ffc247' : '#46d39a';
    g.fillRect(24, y + unit * 0.35, 4, 4);
    g.fillStyle = '#4cc2ff';
    g.fillRect(31, y + unit * 0.35, 4, 4);
  }
  return finish(c);
}

/** Rear of a rack: cable bundles and PSU blanking plates. */
export function rackBackTexture() {
  const [c, g] = canvas(256);
  g.fillStyle = '#0a0d11';
  g.fillRect(0, 0, 256, 256);

  const unit = 256 / 21;
  for (let i = 0; i < 21; i++) {
    const y = i * unit;
    g.fillStyle = i % 2 ? '#171c22' : '#1b2027';
    g.fillRect(6, y + 1, 244, unit - 2);
    g.fillStyle = '#2b333c';
    g.fillRect(180, y + 2, 30, unit - 4);
    g.fillRect(214, y + 2, 30, unit - 4);
  }
  // cable bundle down one side
  const colors = ['#2f7ad6', '#d64f4f', '#e0c341', '#3fb87a', '#8a8f96'];
  for (let i = 0; i < 22; i++) {
    g.strokeStyle = colors[i % colors.length];
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(20 + i * 2, 0);
    g.bezierCurveTo(60 + i * 2, 90, 10 + i * 2, 150, 40 + i * 2, 256);
    g.stroke();
  }
  return finish(c);
}

/** Painted concrete wall with a faint scuff gradient. */
export function wallTexture(repeatX = 8, repeatY = 2) {
  const [c, g] = canvas(256);
  g.fillStyle = '#171d24';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.02})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 236, 256, 20);
  return finish(c, repeatX, repeatY);
}
