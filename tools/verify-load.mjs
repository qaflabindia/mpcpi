/**
 * verify-load.mjs — does Chrome actually load this extension?
 *
 * `--load-extension` fails silently: Chrome starts, the flag is ignored or the
 * manifest is rejected, and every chrome-extension:// URL resolves to
 * chrome-error://chromewebdata. A target existing in the debugger proves
 * nothing, because CDP creates one for any URL you ask for. This checks what
 * the page actually resolved to.
 *
 *   node tools/verify-load.mjs <extension-dir> [port]
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const EXT = resolve(process.argv[2] ?? 'extension');
const PORT = Number(process.argv[3] ?? 9450);
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const idFor = (p) => {
  const h = createHash('sha256').update(p).digest('hex').slice(0, 32);
  return [...h].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
};

const profile = mkdtempSync(join(tmpdir(), 'mpcpi-verify-'));
const args = [
  `--user-data-dir=${profile}`,
  `--load-extension=${EXT}`,
  '--disable-features=DisableLoadExtensionCommandLineSwitch',
  '--no-first-run', '--no-default-browser-check', '--headless=new',
  `--remote-debugging-port=${PORT}`, 'about:blank',
];
const chrome = spawn(CHROME, args, { stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
chrome.stderr.on('data', (d) => { stderr += d.toString(); });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fetchJson = async (path) => (await fetch(`http://localhost:${PORT}${path}`)).json();

async function waitReady(n = 40) {
  for (let i = 0; i < n; i++) {
    try { await fetchJson('/json/version'); return true; } catch { await sleep(400); }
  }
  return false;
}

const connect = (u) => new Promise((res, rej) => { const w = new WebSocket(u); w.onopen = () => res(w); w.onerror = () => rej(new Error('ws')); });
function ev(ws, expr, id) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('eval timeout')), 12000);
    const on = (e) => { const m = JSON.parse(e.data); if (m.id === id) { clearTimeout(t); ws.removeEventListener('message', on); res(m.result); } };
    ws.addEventListener('message', on);
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression: expr, awaitPromise: true, returnByValue: true } }));
  });
}

const cleanup = () => { try { chrome.kill('SIGKILL'); } catch {} try { rmSync(profile, { recursive: true, force: true }); } catch {} };

try {
  if (!await waitReady()) { console.log('FAIL  Chrome never opened a debugging port'); cleanup(); process.exit(1); }
  const eid = idFor(EXT);
  await fetch(`http://localhost:${PORT}/json/new?chrome-extension://${eid}/manifest.json`, { method: 'PUT' });
  await sleep(2500);

  const targets = await fetchJson('/json/list');
  const t = targets.find((x) => x.url.includes(`${eid}/manifest.json`));
  if (!t) { console.log('FAIL  no target for the extension URL'); cleanup(); process.exit(1); }

  const ws = await connect(t.webSocketDebuggerUrl);
  const r = await ev(ws, `JSON.stringify({href: location.href, len: document.body ? document.body.innerText.length : 0, text: (document.body?document.body.innerText:'').slice(0,120)})`, 1);
  ws.close();
  const state = JSON.parse(r.result.value);

  if (state.href.startsWith('chrome-error')) {
    console.log(`FAIL  extension did not load — ${eid}/manifest.json resolved to ${state.href}`);
    const hints = stderr.split('\n').filter((l) => /extension|manifest|csp|insecure|invalid/i.test(l)).slice(0, 6);
    if (hints.length) { console.log('\nChrome said:'); for (const h of hints) console.log('  ' + h.trim().slice(0, 160)); }
    else console.log('\n(Chrome logged no extension error — the flag was most likely ignored outright.)');
    cleanup(); process.exit(1);
  }
  console.log(`PASS  extension loaded as ${eid}`);
  console.log(`      manifest served, ${state.len} bytes: ${state.text.replace(/\s+/g, ' ').slice(0, 80)}…`);
  cleanup(); process.exit(0);
} catch (e) {
  console.log('FAIL ', e.message);
  cleanup(); process.exit(1);
}
