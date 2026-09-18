/**
 * devserver.js — serves extension/ over http for smoke-testing the panel
 * outside Chrome's extension host. Development only; not shipped.
 *
 * It stubs the `chrome.*` surface the panel touches so the UI, SQLite, charts
 * and the whole computational path can be exercised in a plain browser tab.
 */
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('../extension/', import.meta.url).pathname;
const PORT = 8731;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.map': 'application/json',
};

const SHIM = `<script>
// Development shim: a minimal chrome.* surface so the panel runs in a plain tab.
window.chrome = window.chrome || {};
chrome.runtime = {
  getURL: (p) => '/' + p.replace(/^\\.\\.\\//, '').replace(/^\\//, ''),
  lastError: null,
  sendMessage: (msg, cb) => {
    const reply = {
      ping: { ok: true },
      getSettings: { provider: 'anthropic', model: null, baseUrl: null, apiKeys: {}, allowedMcpServers: [], mcpServers: [] },
      setSettings: { ok: true },
      setApiKey: { ok: true },
      listProviders: { providers: [
        { id: 'anthropic', label: 'Anthropic (Claude)', kind: 'cloud', defaultBaseUrl: 'https://api.anthropic.com', defaultModel: 'claude-sonnet-5', models: ['claude-opus-5','claude-sonnet-5'], needsKey: true, docs: null, note: null },
        { id: 'ollama', label: 'Ollama (local)', kind: 'local', defaultBaseUrl: 'http://localhost:11434', defaultModel: 'llama3.1', models: ['llama3.1'], needsKey: false, docs: null, note: 'dev shim' },
      ] },
      listModels: { models: ['claude-sonnet-5', 'claude-opus-5'] },
      mcpList: { servers: [], tools: [] },
      complete: { ok: false, error: 'No model provider in the dev shim. Load the real extension to use the agent.' },
    }[msg.type] || { error: 'dev shim: ' + msg.type };
    setTimeout(() => cb && cb(reply), 5);
  },
  // Keep listeners so the overlay's toggle path can be exercised from the console:
  //   __mpcpiDispatch({ type: 'mpcpi:toggle' })
  onMessage: { _l: [], addListener(fn) { this._l.push(fn); } },
};
window.__mpcpiDispatch = (msg) => chrome.runtime.onMessage._l.map((fn) => fn(msg, {}, () => {}));
chrome.storage = {
  local: {
    get: (k, cb) => { const r = {}; const keys = typeof k === 'string' ? [k] : Array.isArray(k) ? k : Object.keys(k || {});
      for (const key of keys) { try { const v = localStorage.getItem('shim:' + key); if (v) r[key] = JSON.parse(v); } catch {} }
      return cb ? cb(r) : Promise.resolve(r); },
    set: (o, cb) => { for (const [key, v] of Object.entries(o)) localStorage.setItem('shim:' + key, JSON.stringify(v)); return cb ? cb() : Promise.resolve(); },
  },
};
</script>`;

http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/' || p === '') p = '/panel/index.html';
    const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    const s = await stat(file);
    if (s.isDirectory()) throw new Error('dir');
    let body = await readFile(file);
    const type = TYPES[extname(file)] || 'application/octet-stream';
    if (extname(file) === '.html') body = Buffer.from(String(body).replace('</head>', SHIM + '</head>'));
    res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store', 'cross-origin-opener-policy': 'same-origin' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
}).listen(PORT, () => console.log(`dev server on http://localhost:${PORT}/panel/index.html`));
