/**
 * service-worker.js — the privileged edge of the extension.
 *
 * Everything that needs host permissions happens here and nowhere else:
 *   - LLM completions (keys never enter a page context)
 *   - MCP JSON-RPC calls
 *   - Google Sheets export fetches, which carry the user's own cookies so a
 *     private sheet they can already open works with no OAuth flow
 *
 * MV3 workers are terminated when idle. Nothing stateful lives here: the SQLite
 * database and the analysis live in the panel, which is a real page.
 */

import { complete, testProvider, listModels, providerList } from '../agent/providers.js';
import { McpRegistry } from '../agent/mcp.js';

const mcp = new McpRegistry();

const DEFAULT_SETTINGS = {
  provider: 'anthropic',
  model: null,
  baseUrl: null,
  apiKeys: {},            // {providerId: key}
  temperature: null,      // null = the provider's own default; some models reject the parameter
  maxTokens: 4096,
  allowedMcpServers: [],  // servers the user has chosen not to be asked about again
  panel: { width: 980, height: 720, x: null, y: null, collapsed: false },
  telemetry: false,       // never on; kept explicit so the answer is visible
};

async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

async function setSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

/** Resolve the provider config for a call, injecting the stored key. */
async function providerConfig(override = {}) {
  const s = await getSettings();
  const provider = override.provider || s.provider;
  return {
    provider,
    model: override.model || (override.provider && override.provider !== s.provider ? null : s.model),
    baseUrl: override.baseUrl ?? (override.provider && override.provider !== s.provider ? null : s.baseUrl),
    apiKey: override.apiKey ?? s.apiKeys?.[provider] ?? null,
    temperature: override.temperature ?? s.temperature,
    maxTokens: override.maxTokens ?? s.maxTokens,
  };
}

/* ─────────────────────────── Google Sheets ─────────────────────────── */

/**
 * Fetch a Google Sheet as a workbook. `credentials: 'include'` sends the user's
 * Google cookies, so this works for any sheet they can already open — private
 * ones included — without asking for an OAuth token or a service account.
 */
async function fetchGoogleSheet(url) {
  const id = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(url)?.[1] || (/^[a-zA-Z0-9-_]{20,}$/.test(url.trim()) ? url.trim() : null);
  if (!id) return { error: 'That does not look like a Google Sheets URL or document id.' };

  const xlsxUrl = `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
  let res;
  try {
    res = await fetch(xlsxUrl, { credentials: 'include', redirect: 'follow' });
  } catch (e) {
    return { error: `Could not reach Google Sheets: ${e.message}` };
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return { error: 'Google refused the request (HTTP ' + res.status + '). Sign in to the Google account that can open this sheet in this browser profile, or use File → Share → Publish to the web and paste that link instead.' };
    }
    if (res.status === 404) return { error: 'No sheet with that id is visible to this browser profile.' };
    return { error: `Google Sheets returned HTTP ${res.status}.` };
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/html')) {
    return { error: 'Google returned a sign-in page rather than the file. Open the sheet in a tab first so this profile is authenticated, then try again.' };
  }

  const buf = await res.arrayBuffer();
  return { ok: true, id, bytes: Array.from(new Uint8Array(buf)), contentType: ct, sourceRef: xlsxUrl };
}

/** Fetch one tab as CSV — the fallback for link-shared sheets. */
async function fetchSheetCsv(id, sheetName) {
  const u = sheetName
    ? `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`
    : `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`;
  const res = await fetch(u, { credentials: 'include' });
  if (!res.ok) return { error: `HTTP ${res.status} fetching "${sheetName || 'default tab'}"` };
  return { ok: true, text: await res.text() };
}

/* ─────────────────────────── message router ─────────────────────────── */

const handlers = {
  async ping() { return { ok: true, at: Date.now() }; },

  async getSettings() { const s = await getSettings(); return { ...s, apiKeys: Object.fromEntries(Object.entries(s.apiKeys || {}).map(([k, v]) => [k, v ? `••••${String(v).slice(-4)}` : null])) }; },

  async setSettings({ patch }) { const s = await setSettings(patch); return { ok: true, settings: { ...s, apiKeys: undefined } }; },

  async setApiKey({ provider, key }) {
    const s = await getSettings();
    const apiKeys = { ...(s.apiKeys || {}) };
    if (key) apiKeys[provider] = key; else delete apiKeys[provider];
    await setSettings({ apiKeys });
    return { ok: true, provider, stored: !!key };
  },

  async listProviders() { return { providers: providerList() }; },

  async listModels({ provider, baseUrl, apiKey }) { return listModels(await providerConfig({ provider, baseUrl, apiKey })); },

  async testProvider({ provider, baseUrl, apiKey, model }) { return testProvider(await providerConfig({ provider, baseUrl, apiKey, model })); },

  async complete({ request, override }) {
    const cfg = await providerConfig(override || {});
    try { return { ok: true, response: await complete(cfg, request) }; }
    catch (e) { return { ok: false, error: String(e.message || e) }; }
  },

  async fetchGoogleSheet({ url }) { return fetchGoogleSheet(url); },
  async fetchSheetCsv({ id, sheetName }) { return fetchSheetCsv(id, sheetName); },

  async fetchUrl({ url }) {
    // Used only for user-pasted CSV endpoints. Kept narrow on purpose.
    if (!/^https?:\/\//i.test(url)) return { error: 'only http(s) URLs are supported' };
    try {
      const r = await fetch(url, { credentials: 'omit' });
      if (!r.ok) return { error: `HTTP ${r.status}` };
      const ct = r.headers.get('content-type') || '';
      if (/json|text|csv/i.test(ct)) return { ok: true, text: await r.text(), contentType: ct };
      return { ok: true, bytes: Array.from(new Uint8Array(await r.arrayBuffer())), contentType: ct };
    } catch (e) { return { error: String(e.message || e) }; }
  },

  /* ── MCP ── */
  async mcpAdd({ name, url, headers }) {
    try {
      const info = await mcp.add({ name, url, headers });
      const s = await getSettings();
      const servers = (s.mcpServers || []).filter((x) => x.name !== name).concat([{ name, url, headers: headers || {} }]);
      await setSettings({ mcpServers: servers });
      return { ok: true, ...info };
    } catch (e) { return { ok: false, error: String(e.message || e) }; }
  },
  async mcpRemove({ name }) {
    mcp.remove(name);
    const s = await getSettings();
    await setSettings({ mcpServers: (s.mcpServers || []).filter((x) => x.name !== name), allowedMcpServers: (s.allowedMcpServers || []).filter((x) => x !== name) });
    return { ok: true };
  },
  async mcpList() { return { servers: mcp.list(), tools: await mcp.allTools() }; },
  async mcpHealth() { return { rows: await mcp.health() }; },
  async mcpCall({ name, args }) {
    try { return { ok: true, result: await mcp.call(name, args) }; }
    catch (e) { return { ok: false, error: String(e.message || e) }; }
  },
  async mcpReconnect() {
    const s = await getSettings();
    const out = [];
    for (const srv of s.mcpServers || []) {
      try { out.push({ ...await mcp.add(srv), ok: true }); }
      catch (e) { out.push({ name: srv.name, ok: false, error: String(e.message || e) }); }
    }
    return { servers: out };
  },
  async mcpAllow({ name, allowed }) {
    const s = await getSettings();
    const list = new Set(s.allowedMcpServers || []);
    if (allowed) list.add(name); else list.delete(name);
    await setSettings({ allowedMcpServers: [...list] });
    return { ok: true, allowedMcpServers: [...list] };
  },
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const h = handlers[msg?.type];
  if (!h) { sendResponse({ error: `unknown message type "${msg?.type}"` }); return false; }
  Promise.resolve(h(msg.payload || {}, sender))
    .then((r) => sendResponse(r))
    .catch((e) => sendResponse({ error: String(e.message || e), stack: e.stack?.split('\n').slice(0, 3).join(' | ') }));
  return true;   // async response
});

/* ─────────────────────────── panel toggling ─────────────────────────── */

async function togglePanel(tab) {
  if (!tab?.id) return;
  const url = tab.url || '';
  if (/^(chrome|edge|about|devtools|chrome-extension):/i.test(url)) {
    // The overlay cannot be injected into browser-internal pages.
    await chrome.tabs.create({ url: chrome.runtime.getURL('panel/index.html?standalone=1') });
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'mpcpi:toggle' });
  } catch {
    // Content script not present (installed mid-session, or a restricted page).
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/overlay.js'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'mpcpi:toggle' });
    } catch {
      await chrome.tabs.create({ url: chrome.runtime.getURL('panel/index.html?standalone=1') });
    }
  }
}

chrome.action.onClicked.addListener(togglePanel);
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'toggle-panel') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  togglePanel(tab);
});

chrome.runtime.onInstalled.addListener(async (details) => {
  await getSettings();
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'mpcpi-open', title: 'Open MPCPI panel', contexts: ['page', 'selection'] });
    chrome.contextMenus.create({ id: 'mpcpi-sheet', title: 'Load this Google Sheet into MPCPI', contexts: ['page'], documentUrlPatterns: ['https://docs.google.com/spreadsheets/*'] });
  });
  if (details.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html?welcome=1') });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'mpcpi-open') return togglePanel(tab);
  if (info.menuItemId === 'mpcpi-sheet') {
    await togglePanel(tab);
    setTimeout(() => chrome.tabs.sendMessage(tab.id, { type: 'mpcpi:load-sheet', url: tab.url }).catch(() => {}), 900);
  }
});

// Re-attach MCP servers whenever the worker wakes.
chrome.runtime.onStartup?.addListener(() => handlers.mcpReconnect().catch(() => {}));
