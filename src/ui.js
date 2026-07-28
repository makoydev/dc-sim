import * as THREE from 'three';

const el = (tag, cls, html) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (html != null) node.innerHTML = html;
  return node;
};

export class HUD {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div id="crosshair"></div>
      <div id="prompt" class="panel">
        <div class="line"><span class="key">E</span><span class="label"></span></div>
        <div class="hint"></div>
        <div class="track"><div class="fill"></div></div>
      </div>
      <div id="status">
        <div class="panel cell"><b class="clock">08:00</b><span>shift clock</span></div>
        <div class="panel cell"><b class="uptime">100.00%</b><span>uptime sla</span></div>
        <div class="panel cell"><b class="temp">21.5&deg;C</b><span>hall avg</span></div>
        <div class="panel cell"><b class="tasks">0/0</b><span>checklist</span></div>
      </div>
      <div id="checklist" class="panel">
        <h3><span>Shift Checklist</span><span class="dim">TAB</span></h3>
        <ul></ul>
      </div>
      <div id="alerts"></div>
      <div id="log"></div>
      <div id="carry" class="panel">
        <div class="item dim">Hands free</div>
        <div class="torch dim" hidden>Torch off</div>
        <div id="stamina"><div></div></div>
      </div>
      <div id="marker"><div class="ring"></div><div class="text"></div></div>
      <div id="overlay" class="overlay"></div>
    `;

    this.q = (sel) => root.querySelector(sel);
    this.prompt = this.q('#prompt');
    this.promptLabel = this.q('#prompt .label');
    this.promptHint = this.q('#prompt .hint');
    this.promptFill = this.q('#prompt .fill');
    this.crosshair = this.q('#crosshair');
    this.list = this.q('#checklist ul');
    this.checklist = this.q('#checklist');
    this.alerts = this.q('#alerts');
    this.log = this.q('#log');
    this.carry = this.q('#carry .item');
    this.stamina = this.q('#stamina div');
    this.marker = this.q('#marker');
    this.overlay = this.q('#overlay');
    this._projected = new THREE.Vector3();
    this._listSignature = '';
  }

  setPrompt(action, progress) {
    if (!action) {
      this.prompt.classList.remove('show');
      this.crosshair.classList.remove('hot');
      return;
    }
    this.prompt.classList.add('show');
    this.crosshair.classList.add('hot');
    this.promptLabel.textContent = action.label;
    this.promptHint.textContent = action.hint ?? '';
    this.promptHint.style.display = action.hint ? 'block' : 'none';
    this.promptLabel.className = `label${action.disabled ? ' dim' : ''}`;
    this.promptFill.style.width = `${Math.round((progress ?? 0) * 100)}%`;
  }

  setStatus({ clock, uptime, temp, done, total }) {
    this.q('#status .clock').textContent = clock;
    const up = this.q('#status .uptime');
    up.textContent = `${uptime.toFixed(2)}%`;
    up.className = `uptime ${uptime >= 99.95 ? 'ok' : uptime >= 99.5 ? 'warn' : 'bad'}`;
    const t = this.q('#status .temp');
    t.textContent = `${temp.toFixed(1)}°C`;
    t.className = `temp ${temp < 25 ? 'ok' : temp < 29 ? 'warn' : 'bad'}`;
    this.q('#status .tasks').textContent = `${done}/${total}`;
  }

  setChecklist(tasks) {
    const signature = tasks
      .map((t) => `${t.id}${t.state}${t.progressText ?? ''}${t.dueText ?? ''}`)
      .join('|');
    if (signature === this._listSignature) return;
    this._listSignature = signature;

    this.list.innerHTML = '';
    for (const task of tasks) {
      const li = el('li', task.state);
      const mark = task.state === 'done' ? '&#10003;' : task.state === 'failed' ? '&times;' : '';
      li.appendChild(el('div', 'box', mark));
      const body = el('div');
      body.appendChild(el('div', null, task.title));
      if (task.progressText) body.appendChild(el('small', null, task.progressText));
      li.appendChild(body);
      if (task.dueText) {
        li.appendChild(el('div', `due ${task.dueClass ?? 'dim'}`, task.dueText));
      }
      this.list.appendChild(li);
    }
  }

  toggleChecklist() {
    this.checklist.style.display =
      this.checklist.style.display === 'none' ? 'block' : 'none';
  }

  setAlerts(list) {
    const signature = list.map((a) => a.text + a.kind).join('|');
    if (signature === this._alertSignature) return;
    this._alertSignature = signature;
    this.alerts.innerHTML = '';
    for (const a of list) this.alerts.appendChild(el('div', `alert ${a.kind}`, a.text));
  }

  say(text, kind = '') {
    const node = el('div', kind, text);
    this.log.appendChild(node);
    while (this.log.children.length > 4) this.log.firstChild.remove();
    setTimeout(() => {
      node.style.transition = 'opacity 0.6s';
      node.style.opacity = '0';
      setTimeout(() => node.remove(), 600);
    }, 5200);
  }

  setCarry(item) {
    this.carry.textContent = item ? `Carrying: ${item.label}` : 'Hands free';
    this.carry.className = item ? 'item accent' : 'item dim';
  }

  /** `torch` is null on the day shift, where there is nothing to report. */
  setTorch(torch) {
    const node = this.q('#carry .torch');
    node.hidden = !torch;
    if (!torch) return;
    const pct = Math.round(torch.battery * 100);
    node.textContent = torch.on ? `Torch ${pct}%` : `Torch off · ${pct}%`;
    node.className = `torch ${!torch.on ? 'dim' : torch.low ? 'bad' : 'warn'}`;
  }

  setStamina(value) {
    this.stamina.style.width = `${Math.round(value * 100)}%`;
    this.stamina.style.background = value < 0.25 ? 'var(--warn)' : 'var(--accent)';
  }

  setMarker(worldPos, camera, label) {
    if (!worldPos) {
      this.marker.style.display = 'none';
      return;
    }
    this._projected.copy(worldPos).project(camera);
    const behind = this._projected.z > 1;
    const x = THREE.MathUtils.clamp(this._projected.x, -0.92, 0.92);
    const y = THREE.MathUtils.clamp(this._projected.y, -0.85, 0.9);
    const sx = (behind ? -x : x) * 0.5 + 0.5;
    const sy = (behind ? -0.85 : y) * -0.5 + 0.5;
    this.marker.style.display = 'block';
    this.marker.style.left = `${sx * innerWidth}px`;
    this.marker.style.top = `${sy * innerHeight}px`;
    this.marker.querySelector('.text').textContent = label;
  }

  showOverlay(html, wire) {
    this.overlay.innerHTML = `<div class="card">${html}</div>`;
    this.overlay.classList.add('show');
    wire?.(this.overlay);
  }

  hideOverlay() {
    this.overlay.classList.remove('show');
    this.overlay.innerHTML = '';
  }
}
