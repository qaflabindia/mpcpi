/**
 * overlay.js — the floating layer.
 *
 * Injects a draggable, resizable, collapsible shell into whatever page the user
 * is on, hosting the real panel in an extension-origin iframe. Two reasons for
 * the iframe rather than rendering into the page:
 *
 *   1. The panel gets the extension's own CSP, so SQLite's WebAssembly and the
 *      chart library load normally regardless of the host page's policy.
 *   2. Nothing of the host page can read the panel, and nothing of the panel
 *      leaks into the host page's styles or globals.
 *
 * The shell itself lives in a closed shadow root so the host page's CSS cannot
 * reach it either.
 */

(() => {
  if (window.__mpcpiOverlayInstalled) return;
  window.__mpcpiOverlayInstalled = true;

  const HOST_ID = 'mpcpi-overlay-host';
  const MIN_W = 420, MIN_H = 320;
  let host = null, shadow = null, shell = null, frame = null, state = null;

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  const DEFAULT_STATE = { x: null, y: null, w: 980, h: 720, collapsed: false, open: false, opacity: 1 };

  async function loadState() {
    try {
      const { overlayState } = await chrome.storage.local.get('overlayState');
      return { ...DEFAULT_STATE, ...(overlayState || {}) };
    } catch { return { ...DEFAULT_STATE }; }
  }
  const saveState = () => { try { chrome.storage.local.set({ overlayState: { ...state, open: undefined } }); } catch {} };

  const CSS = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }
.shell {
  position: fixed; z-index: 2147483600;
  display: flex; flex-direction: column;
  background: #0b1020; color: #e6edf6;
  border: 1px solid rgba(148,163,184,.28);
  border-radius: 14px;
  box-shadow: 0 24px 64px -12px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.04) inset;
  font: 13px/1.45 ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
  overflow: hidden;
  transition: opacity .12s ease, height .16s cubic-bezier(.4,0,.2,1);
  will-change: transform;
}
.shell.dragging, .shell.resizing { transition: none; user-select: none; }
.shell.dragging iframe, .shell.resizing iframe { pointer-events: none; }
.bar {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 8px 7px 12px; cursor: grab;
  background: linear-gradient(180deg, rgba(30,41,59,.95), rgba(15,23,42,.95));
  border-bottom: 1px solid rgba(148,163,184,.18);
  flex: 0 0 auto;
}
.bar:active { cursor: grabbing; }
.mark {
  width: 20px; height: 20px; border-radius: 6px; flex: 0 0 auto;
  background: linear-gradient(135deg,#22d3ee,#6366f1 55%,#f59e0b);
  display: grid; place-items: center; font-size: 10px; font-weight: 800; color: #04121f; letter-spacing: -.5px;
}
.title { font-weight: 650; letter-spacing: .2px; font-size: 12.5px; }
.sub { color: #7c8ba1; font-size: 11px; font-variant-numeric: tabular-nums; }
.spacer { flex: 1 1 auto; }
button.icon {
  all: unset; cursor: pointer; width: 26px; height: 24px; border-radius: 6px;
  display: grid; place-items: center; color: #93a4bb; font-size: 14px; line-height: 1;
}
button.icon:hover { background: rgba(148,163,184,.16); color: #e6edf6; }
button.icon:focus-visible { outline: 2px solid #38bdf8; outline-offset: -2px; }
.body { flex: 1 1 auto; min-height: 0; background: #0b1020; }
iframe { width: 100%; height: 100%; border: 0; display: block; background: #0b1020; }
.shell.collapsed .body { display: none; }
.grip {
  position: absolute; width: 14px; height: 14px; right: 2px; bottom: 2px;
  cursor: nwse-resize; opacity: .5;
  background:
    linear-gradient(135deg, transparent 45%, #64748b 45%, #64748b 55%, transparent 55%),
    linear-gradient(135deg, transparent 70%, #64748b 70%, #64748b 80%, transparent 80%);
}
.edge { position: absolute; }
.edge.l { left: -3px; top: 0; bottom: 0; width: 6px; cursor: ew-resize; }
.edge.r { right: -3px; top: 0; bottom: 0; width: 6px; cursor: ew-resize; }
.edge.b { left: 0; right: 0; bottom: -3px; height: 6px; cursor: ns-resize; }
@media (prefers-reduced-motion: reduce) { .shell { transition: none; } }
`;

  function build() {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:static;';
    shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = CSS;
    shadow.append(style);

    shell = document.createElement('div');
    shell.className = 'shell';
    shell.setAttribute('role', 'dialog');
    shell.setAttribute('aria-label', 'MPCPI currency pricing panel');

    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.innerHTML = `
      <div class="mark">MP</div>
      <div class="title">MPCPI</div>
      <div class="sub" id="sub">BCC-T workbench</div>
      <div class="spacer"></div>
      <button class="icon" id="dim"     title="Toggle transparency"   aria-label="Toggle transparency">◐</button>
      <button class="icon" id="pop"     title="Open in its own tab"   aria-label="Open in its own tab">⧉</button>
      <button class="icon" id="collapse" title="Collapse"             aria-label="Collapse">—</button>
      <button class="icon" id="close"   title="Close (Alt+Shift+M)"   aria-label="Close">✕</button>`;

    const body = document.createElement('div');
    body.className = 'body';
    frame = document.createElement('iframe');
    frame.setAttribute('allow', 'clipboard-write');
    frame.setAttribute('title', 'MPCPI panel');
    frame.src = chrome.runtime.getURL('panel/index.html');
    body.append(frame);

    const grip = document.createElement('div'); grip.className = 'grip';
    const eL = document.createElement('div'); eL.className = 'edge l';
    const eR = document.createElement('div'); eR.className = 'edge r';
    const eB = document.createElement('div'); eB.className = 'edge b';

    shell.append(bar, body, grip, eL, eR, eB);
    shadow.append(shell);
    (document.body || document.documentElement).append(host);

    bar.querySelector('#close').onclick = () => toggle(false);
    bar.querySelector('#collapse').onclick = () => setCollapsed(!state.collapsed);
    bar.querySelector('#pop').onclick = () => {
      window.open(chrome.runtime.getURL('panel/index.html?standalone=1'), '_blank', 'noopener');
      toggle(false);
    };
    bar.querySelector('#dim').onclick = () => {
      state.opacity = state.opacity > 0.9 ? 0.72 : 1;
      shell.style.opacity = state.opacity;
      saveState();
    };
    bar.addEventListener('pointerdown', (e) => { if (!e.target.closest('button')) startDrag(e); });
    bar.addEventListener('dblclick', (e) => { if (!e.target.closest('button')) setCollapsed(!state.collapsed); });

    grip.addEventListener('pointerdown', (e) => startResize(e, { right: true, bottom: true }));
    eR.addEventListener('pointerdown', (e) => startResize(e, { right: true }));
    eL.addEventListener('pointerdown', (e) => startResize(e, { left: true }));
    eB.addEventListener('pointerdown', (e) => startResize(e, { bottom: true }));

    applyGeometry();
  }

  function applyGeometry() {
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = clamp(state.w, MIN_W, Math.max(MIN_W, vw - 16));
    const h = clamp(state.h, MIN_H, Math.max(MIN_H, vh - 16));
    const x = state.x === null ? Math.max(8, vw - w - 24) : clamp(state.x, 4, Math.max(4, vw - w - 4));
    const y = state.y === null ? Math.max(8, Math.round((vh - h) / 2)) : clamp(state.y, 4, Math.max(4, vh - 48));
    Object.assign(shell.style, {
      left: `${x}px`, top: `${y}px`,
      width: `${w}px`,
      height: state.collapsed ? '38px' : `${h}px`,
      opacity: String(state.opacity ?? 1),
    });
    shell.classList.toggle('collapsed', !!state.collapsed);
    state.w = w; state.h = h; state.x = x; state.y = y;
  }

  function setCollapsed(v) {
    state.collapsed = v;
    shadow.querySelector('#collapse').textContent = v ? '□' : '—';
    applyGeometry();
    saveState();
  }

  function startDrag(e) {
    e.preventDefault();
    const sx = e.clientX, sy = e.clientY, ox = state.x, oy = state.y;
    shell.classList.add('dragging');
    const move = (ev) => {
      state.x = clamp(ox + ev.clientX - sx, 4, window.innerWidth - state.w - 4);
      state.y = clamp(oy + ev.clientY - sy, 4, window.innerHeight - 40);
      shell.style.left = `${state.x}px`;
      shell.style.top = `${state.y}px`;
    };
    const up = () => {
      shell.classList.remove('dragging');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      saveState();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function startResize(e, dirs) {
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const ow = state.w, oh = state.h, ox = state.x;
    shell.classList.add('resizing');
    const move = (ev) => {
      if (dirs.right) state.w = clamp(ow + ev.clientX - sx, MIN_W, window.innerWidth - state.x - 8);
      if (dirs.left) {
        const w = clamp(ow - (ev.clientX - sx), MIN_W, ox + ow - 8);
        state.x = ox + ow - w;
        state.w = w;
      }
      if (dirs.bottom) state.h = clamp(oh + ev.clientY - sy, MIN_H, window.innerHeight - state.y - 8);
      shell.style.width = `${state.w}px`;
      shell.style.left = `${state.x}px`;
      if (!state.collapsed) shell.style.height = `${state.h}px`;
    };
    const up = () => {
      shell.classList.remove('resizing');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      saveState();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  async function toggle(force) {
    if (!state) state = await loadState();
    const want = force === undefined ? !state.open : force;
    if (want && !host) build();
    if (!host) return;
    state.open = want;
    host.style.display = want ? '' : 'none';
    if (want) { applyGeometry(); frame?.contentWindow?.postMessage({ type: 'mpcpi:shown' }, '*'); }
  }

  window.addEventListener('resize', () => { if (state?.open && shell) applyGeometry(); });

  // Esc closes only when the panel has focus, so it never steals the key from
  // the host page.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state?.open && shadow?.activeElement) toggle(false);
  });

  chrome.runtime.onMessage.addListener((msg, _s, reply) => {
    if (msg?.type === 'mpcpi:toggle') { toggle(); reply({ ok: true }); return true; }
    if (msg?.type === 'mpcpi:load-sheet') {
      toggle(true).then(() => setTimeout(() => frame?.contentWindow?.postMessage({ type: 'mpcpi:load-sheet', url: msg.url }, '*'), 700));
      reply({ ok: true });
      return true;
    }
    return false;
  });

  // The panel asks the shell for things only the content script can do.
  window.addEventListener('message', (e) => {
    if (e.source !== frame?.contentWindow) return;
    const m = e.data;
    if (m?.type === 'mpcpi:close') toggle(false);
    if (m?.type === 'mpcpi:status' && shadow) {
      const sub = shadow.querySelector('#sub');
      if (sub) sub.textContent = String(m.text || '').slice(0, 64);
    }
    if (m?.type === 'mpcpi:resize' && m.w && m.h) {
      state.w = m.w; state.h = m.h; applyGeometry(); saveState();
    }
    if (m?.type === 'mpcpi:current-url') {
      frame?.contentWindow?.postMessage({ type: 'mpcpi:current-url', url: location.href }, '*');
    }
  });

  // If the user is already on a Google Sheet, the panel offers to load it.
  if (/^https:\/\/docs\.google\.com\/spreadsheets\//.test(location.href)) {
    window.__mpcpiSheetUrl = location.href;
  }
})();
