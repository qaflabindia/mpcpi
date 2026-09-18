/** options.js — first-run setup. Shares the panel's provider plumbing. */

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const send = (type, payload = {}) => new Promise((res) => chrome.runtime.sendMessage({ type, payload }, (r) => res(r ?? { error: chrome.runtime.lastError?.message })));

if (new URLSearchParams(location.search).has('welcome')) $('welcome').classList.remove('hidden');

const [{ providers }, settings] = await Promise.all([send('listProviders'), send('getSettings')]);

const host = $('providers');
host.innerHTML = providers.map((p) => {
  const stored = settings.apiKeys?.[p.id];
  return `<div class="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
    <div class="flex flex-wrap items-center gap-2">
      <b class="text-[13px] text-slate-200">${esc(p.label)}</b>
      <span class="badge ${p.kind === 'local' ? 'badge-ok' : p.kind === 'custom' ? '' : 'badge-info'}">${esc(p.kind)}</span>
      ${stored ? `<span class="badge badge-ok">key ${esc(stored)}</span>` : p.needsKey ? '<span class="badge badge-warn">no key</span>' : ''}
      ${settings.provider === p.id ? '<span class="badge badge-info">selected</span>' : ''}
      <div class="flex-1"></div>
      ${p.docs ? `<a href="${esc(p.docs)}" target="_blank" rel="noopener" class="text-[11px] text-cyan-400 underline">get a key</a>` : ''}
    </div>
    ${p.note ? `<div class="hint mt-1.5">${esc(p.note)}</div>` : ''}
    <div class="mt-2 flex flex-wrap gap-2">
      ${p.needsKey ? `<input type="password" class="inp flex-1 min-w-[220px]" id="k_${p.id}" placeholder="API key">` : ''}
      <input type="text" class="inp w-64" id="u_${p.id}" value="${esc(settings.provider === p.id && settings.baseUrl ? settings.baseUrl : '')}" placeholder="${esc(p.defaultBaseUrl)}">
      <button class="btn btn-sm" data-save="${p.id}">Save &amp; select</button>
      <button class="btn btn-sm" data-test="${p.id}">Test</button>
      <span id="t_${p.id}" class="self-center text-[11.5px] text-slate-500"></span>
    </div>
  </div>`;
}).join('');

/* ─────────────────── key-file import ─────────────────── */

const { parseKeyFile, maskKey } = await import('../agent/keyfile.js');
let parsed = null;

const PROVIDER_IDS = providers.map((p) => p.id);

function renderKeyResult() {
  const box = $('keyResult');
  box.classList.remove('hidden');
  if (!parsed || !parsed.entries.length) {
    box.innerHTML = '<div class="note note-warn">No keys found in that text. Each key needs to be on its own line, optionally under a <code># Heading</code> or after <code>NAME=</code>.</div>';
    return;
  }
  box.innerHTML = `
    <table class="tbl">
      <thead><tr><th style="width:2rem"></th><th>label in your file</th><th>key</th><th>assign to</th><th>note</th></tr></thead>
      <tbody>
      ${parsed.entries.map((e, i) => `
        <tr>
          <td><input type="checkbox" class="accent-cyan-500" data-k="${i}" ${e.provider ? 'checked' : ''}></td>
          <td class="text-slate-300">${esc(e.label)}</td>
          <td class="font-mono text-[11px] text-slate-500">${esc(maskKey(e.key))}</td>
          <td>
            <select class="inp w-auto py-1 text-[11.5px]" data-p="${i}">
              <option value="">— skip —</option>
              ${PROVIDER_IDS.map((id) => `<option value="${id}" ${e.provider === id ? 'selected' : ''}>${esc(providers.find((p) => p.id === id).label)}</option>`).join('')}
            </select>
          </td>
          <td class="max-w-md whitespace-normal text-[11px] ${e.note ? 'text-amber-400' : 'text-slate-600'}">${esc(e.note ?? '')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    ${parsed.warnings.map((w) => `<div class="note note-warn mt-2">${esc(w)}</div>`).join('')}
    <div class="mt-3 flex items-center gap-2">
      <button id="btnImportKeys" class="btn btn-primary">Import ticked keys</button>
      <button id="btnClearKeys" class="btn">Clear</button>
      <span id="importMsg" class="text-[11.5px] text-slate-500"></span>
    </div>`;

  $('btnImportKeys').onclick = importKeys;
  $('btnClearKeys').onclick = () => {
    parsed = null;
    $('keyPaste').value = '';
    $('keyFile').value = '';
    box.classList.add('hidden');
    box.innerHTML = '';
  };
}

async function importKeys() {
  const msg = $('importMsg');
  const chosen = [];
  for (let i = 0; i < parsed.entries.length; i++) {
    const ticked = document.querySelector(`[data-k="${i}"]`)?.checked;
    const provider = document.querySelector(`[data-p="${i}"]`)?.value;
    if (ticked && provider) chosen.push({ provider, key: parsed.entries[i].key, label: parsed.entries[i].label });
  }
  if (!chosen.length) { msg.innerHTML = '<span class="text-amber-400">Nothing ticked with a provider selected.</span>'; return; }

  msg.innerHTML = '<span class="spin"></span> storing…';
  const done = [];
  for (const c of chosen) {
    const r = await send('setApiKey', { provider: c.provider, key: c.key });
    done.push(`${c.provider}${r?.ok ? '' : ' (failed)'}`);
  }
  // The parsed keys are not needed once stored; drop them from memory and
  // clear the textarea so they are not left sitting in the DOM.
  parsed = null;
  $('keyPaste').value = '';
  $('keyFile').value = '';
  msg.innerHTML = `<span class="text-emerald-400">stored for ${esc(done.join(', '))}</span> — testing…`;

  const results = [];
  for (const c of chosen) {
    const t = await send('testProvider', { provider: c.provider });
    results.push(`${c.provider}: ${t.ok ? `✓ ${t.model} in ${t.latencyMs} ms${t.recovered ? ` (${t.recovered.join('; ')})` : ''}` : `✕ ${String(t.error).slice(0, 120)}`}`);
  }
  $('keyResult').innerHTML = `
    <div class="note note-ok">Stored ${chosen.length} key(s). Reload this page to see them listed below.</div>
    ${results.map((r) => `<div class="note ${r.includes('✓') ? 'note-ok' : 'note-bad'} mt-2">${esc(r)}</div>`).join('')}`;
}

$('btnParseKeys').onclick = () => {
  const text = $('keyPaste').value;
  if (!text.trim()) { $('keyResult').classList.remove('hidden'); $('keyResult').innerHTML = '<div class="note note-warn">Paste some text, or pick a file.</div>'; return; }
  parsed = parseKeyFile(text);
  renderKeyResult();
};

$('keyFile').onchange = async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  if (f.size > 256 * 1024) { $('keyResult').classList.remove('hidden'); $('keyResult').innerHTML = '<div class="note note-bad">That file is larger than 256 KB, which is not a key file.</div>'; return; }
  parsed = parseKeyFile(await f.text());
  renderKeyResult();
};

/* ─────────────────── provider cards ─────────────────── */

host.addEventListener('click', async (e) => {
  const save = e.target.dataset?.save;
  const test = e.target.dataset?.test;
  if (save) {
    const key = $(`k_${save}`)?.value;
    const url = $(`u_${save}`)?.value.trim();
    if (key) await send('setApiKey', { provider: save, key });
    await send('setSettings', { patch: { provider: save, baseUrl: url || null, model: null } });
    $(`t_${save}`).innerHTML = '<span class="text-emerald-400">saved and selected</span>';
  }
  if (test) {
    const out = $(`t_${test}`);
    out.innerHTML = '<span class="spin"></span> testing…';
    const r = await send('testProvider', { provider: test, baseUrl: $(`u_${test}`)?.value.trim() || null, apiKey: $(`k_${test}`)?.value || undefined });
    out.innerHTML = r.ok
      ? `<span class="text-emerald-400">✓ ${esc(r.model)} replied in ${r.latencyMs} ms</span>`
      : `<span class="text-rose-400">✕ ${esc(String(r.error).slice(0, 180))}</span>`;
  }
});
