/**
 * ingest.js — spreadsheet in, validated canonical tables out.
 *
 * Accepts: an uploaded .xlsx/.xlsm/.csv, a Google Sheets URL, or raw CSV text.
 * Produces: {tables, mapping, report} where `report` is a first-class result,
 * not an afterthought. A financial tool that silently coerces a bad column is
 * worse than one that refuses to run.
 *
 * SheetJS (vendor/xlsx.full.min.js) is used when present; CSV is parsed here so
 * that a plain CSV path works even if the vendor bundle fails to load.
 */

import { SHEETS, SHEET_ALIASES } from './schema.js';
import { num, round } from './num.js';

/* ───────────────────────────── string matching ───────────────────────────── */

const normKey = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Cheap edit-distance-free similarity: token overlap + prefix credit. */
function similarity(a, b) {
  a = normKey(a); b = normKey(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.startsWith(b) || b.startsWith(a)) return 0.9 - Math.abs(a.length - b.length) / Math.max(a.length, b.length) * 0.2;
  if (a.includes(b) || b.includes(a)) return 0.75;
  // bigram Dice coefficient
  const grams = (s) => { const g = new Set(); for (let i = 0; i < s.length - 1; i++) g.add(s.slice(i, i + 2)); return g; };
  const ga = grams(a), gb = grams(b);
  if (!ga.size || !gb.size) return 0;
  let inter = 0;
  for (const g of ga) if (gb.has(g)) inter++;
  return (2 * inter) / (ga.size + gb.size);
}

function bestMatch(candidate, options, threshold = 0.62) {
  let best = null, score = 0;
  for (const [key, aliases] of Object.entries(options)) {
    for (const alias of [key, ...aliases]) {
      const s = similarity(candidate, alias);
      if (s > score) { score = s; best = key; }
    }
  }
  return score >= threshold ? { key: best, score: round(score, 3) } : { key: null, score: round(score, 3) };
}

/* ───────────────────────────── CSV parsing ───────────────────────────── */

/** RFC4180-ish CSV/TSV parser: quotes, escaped quotes, embedded newlines. */
export function parseCSV(text, delimiter = null) {
  const src = String(text ?? '').replace(/^﻿/, '');
  if (!delimiter) {
    const head = src.slice(0, 5000);
    const counts = { ',': (head.match(/,/g) || []).length, '\t': (head.match(/\t/g) || []).length, ';': (head.match(/;/g) || []).length, '|': (head.match(/\|/g) || []).length };
    delimiter = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c === '\r') { /* skip */ }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
}

/* ───────────────────────────── coercion ───────────────────────────── */

const BOOL_TRUE = new Set(['true', 'yes', 'y', '1', 'ok', 'satisfied', 'enforceable', 'x', '✓']);
const BOOL_FALSE = new Set(['false', 'no', 'n', '0', '', 'pending', 'none', '-']);

export function coerce(value, type, colName, rowIdx, issues) {
  if (value === null || value === undefined || value === '') return null;
  const s = typeof value === 'string' ? value.trim() : value;
  switch (type) {
    case 'string':
      return String(s);
    case 'number': {
      const v = num(s, NaN);
      if (!Number.isFinite(v)) { issues.push({ row: rowIdx, column: colName, value, problem: 'not a number' }); return null; }
      return v;
    }
    case 'ratio': {
      let v = num(s, NaN);
      if (!Number.isFinite(v)) { issues.push({ row: rowIdx, column: colName, value, problem: 'not a number' }); return null; }
      // "12%" already divided by num(); a bare 12 for a ratio column is ambiguous.
      if (typeof s === 'string' && s.endsWith('%')) return v;
      if (v > 1.5 && v <= 100) {
        issues.push({ row: rowIdx, column: colName, value, problem: `value ${v} looks like a percentage in a ratio column; interpreted as ${v / 100}`, severity: 'warning', autofix: true });
        return v / 100;
      }
      if (v > 100) { issues.push({ row: rowIdx, column: colName, value, problem: `value ${v} is far outside a plausible ratio range`, severity: 'error' }); return null; }
      return v;
    }
    case 'bool': {
      const k = String(s).toLowerCase();
      if (BOOL_TRUE.has(k)) return true;
      if (BOOL_FALSE.has(k)) return false;
      issues.push({ row: rowIdx, column: colName, value, problem: 'not a recognised boolean', severity: 'warning' });
      return null;
    }
    case 'datetime': {
      if (s instanceof Date) return s.toISOString();
      if (typeof s === 'number') {
        // Excel serial date (days since 1899-12-30), guarded to a sane range.
        if (s > 20000 && s < 60000) return new Date(Math.round((s - 25569) * 86400 * 1000)).toISOString();
        if (s > 1e11) return new Date(s).toISOString();
      }
      const t = Date.parse(String(s));
      if (Number.isFinite(t)) return new Date(t).toISOString();
      issues.push({ row: rowIdx, column: colName, value, problem: 'unparseable date', severity: 'warning' });
      return null;
    }
    case 'list':
      return String(s).split(/[;,|]/).map((x) => num(x.trim(), NaN)).filter(Number.isFinite);
    default:
      return s;
  }
}

/* ───────────────────────────── sheet → table ───────────────────────────── */

/** Find the header row: the first row whose cells best match known columns. */
function findHeaderRow(rows, spec, maxScan = 8) {
  let best = { idx: 0, score: -1 };
  const opts = Object.fromEntries(Object.entries(spec.columns).map(([k, v]) => [k, v.aliases || []]));
  for (let i = 0; i < Math.min(maxScan, rows.length); i++) {
    const r = rows[i];
    const nonEmpty = r.filter((c) => String(c ?? '').trim() !== '').length;
    if (nonEmpty < 2) continue;
    const score = r.reduce((s, c) => s + (bestMatch(c, opts).key ? 1 : 0), 0) / Math.max(1, nonEmpty);
    if (score > best.score) best = { idx: i, score };
  }
  return best;
}

export function mapSheet(sheetName, rows, opts = {}) {
  const sheetKey = opts.forceKey || bestMatch(sheetName, SHEET_ALIASES, 0.55).key;
  if (!sheetKey || !SHEETS[sheetKey]) {
    return { sheetName, recognised: false, reason: `sheet "${sheetName}" does not match any known table`, suggestion: Object.keys(SHEETS) };
  }
  const spec = SHEETS[sheetKey];
  const hdr = findHeaderRow(rows, spec);
  const header = rows[hdr.idx] || [];
  const body = rows.slice(hdr.idx + 1);

  const colOpts = Object.fromEntries(Object.entries(spec.columns).map(([k, v]) => [k, v.aliases || []]));
  const mapping = [], used = new Set(), unmapped = [];
  header.forEach((h, i) => {
    const raw = String(h ?? '').trim();
    if (!raw) return;
    const m = bestMatch(raw, colOpts);
    if (m.key && !used.has(m.key)) {
      used.add(m.key);
      mapping.push({ index: i, header: raw, column: m.key, confidence: m.score, exact: normKey(raw) === normKey(m.key) });
    } else {
      unmapped.push({ index: i, header: raw, bestGuess: m.key, confidence: m.score, reason: m.key ? 'duplicate of an already-mapped column' : 'no match above threshold' });
    }
  });

  const issues = [];
  const records = body.map((r, ri) => {
    const rec = {};
    for (const m of mapping) {
      rec[m.column] = coerce(r[m.index], spec.columns[m.column].type, m.column, ri + hdr.idx + 2, issues);
    }
    rec.__row = ri + hdr.idx + 2;
    return rec;
  }).filter((rec) => Object.entries(rec).some(([k, v]) => k !== '__row' && v !== null && v !== ''));

  const required = Object.entries(spec.columns).filter(([, c]) => c.required).map(([k]) => k);
  const missingRequired = required.filter((k) => !used.has(k));
  const blankRequired = [];
  for (const k of required.filter((k) => used.has(k))) {
    const n = records.filter((r) => r[k] === null || r[k] === '').length;
    if (n) blankRequired.push({ column: k, blankRows: n });
  }

  return {
    sheetName, recognised: true, table: sheetKey, label: spec.label, purpose: spec.purpose,
    headerRow: hdr.idx + 1,
    mapping, unmapped,
    records,
    rowCount: records.length,
    missingRequired,
    blankRequired,
    issues,
    usable: missingRequired.length === 0 && records.length > 0,
  };
}

/* ───────────────────────────── workbook ───────────────────────────── */

/**
 * @param {Object} input {kind:'xlsx'|'csv'|'sheets', data, sheetName?}
 * @param {Object} deps  {XLSX} — pass the SheetJS global when available
 */
export function ingestWorkbook(input, deps = {}) {
  const XLSX = deps.XLSX ?? (typeof globalThis !== 'undefined' ? globalThis.XLSX : null);
  const sheets = [];

  if (input.kind === 'csv' || input.kind === 'text') {
    sheets.push({ name: input.sheetName || 'data', rows: parseCSV(input.data) });
  } else if (input.kind === 'csvBundle') {
    for (const [name, text] of Object.entries(input.data)) sheets.push({ name, rows: parseCSV(text) });
  } else if (input.kind === 'xlsx') {
    if (!XLSX) return { error: 'SheetJS is not loaded; cannot read a binary workbook. Export the sheet as CSV, or reload the panel.' };
    const wb = XLSX.read(input.data, { type: input.dataType || 'array', cellDates: true });
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' });
      if (rows.length) sheets.push({ name, rows });
    }
  } else if (input.kind === 'rows') {
    for (const [name, rows] of Object.entries(input.data)) sheets.push({ name, rows });
  } else {
    return { error: `unknown input kind "${input.kind}"` };
  }

  if (!sheets.length) return { error: 'the workbook contains no readable sheets' };

  const mapped = sheets.map((s) => mapSheet(s.name, s.rows, { forceKey: input.forceKey }));
  const tables = {};
  for (const m of mapped) {
    if (!m.recognised || !m.usable) continue;
    tables[m.table] = (tables[m.table] || []).concat(m.records);
  }

  const recognised = mapped.filter((m) => m.recognised);
  const known = Object.keys(SHEETS);
  const present = Object.keys(tables);

  return {
    sheets: mapped,
    tables,
    report: {
      sheetsRead: sheets.length,
      sheetsRecognised: recognised.length,
      tablesPopulated: present,
      tablesMissing: known.filter((k) => !present.includes(k)),
      totalRows: Object.values(tables).reduce((s, t) => s + t.length, 0),
      lowConfidenceMappings: mapped.flatMap((m) => (m.mapping || []).filter((x) => x.confidence < 0.85).map((x) => ({ sheet: m.sheetName, header: x.header, mappedTo: x.column, confidence: x.confidence }))),
      unmappedColumns: mapped.flatMap((m) => (m.unmapped || []).map((u) => ({ sheet: m.sheetName, header: u.header, reason: u.reason, bestGuess: u.bestGuess }))),
      blockingProblems: mapped.filter((m) => m.recognised && !m.usable).map((m) => ({ sheet: m.sheetName, table: m.table, missingRequired: m.missingRequired, rows: m.rowCount })),
      dataIssues: mapped.flatMap((m) => (m.issues || []).map((i) => ({ sheet: m.sheetName, ...i }))),
      unrecognisedSheets: mapped.filter((m) => !m.recognised).map((m) => m.sheetName),
    },
  };
}

/* ───────────────────────────── Google Sheets ───────────────────────────── */

export function parseSheetsUrl(url) {
  const s = String(url || '');
  const id = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)?.[1] || (/^[a-zA-Z0-9-_]{20,}$/.test(s.trim()) ? s.trim() : null);
  if (!id) return { error: 'not a Google Sheets URL or document id' };
  const gid = s.match(/[#&?]gid=([0-9]+)/)?.[1] ?? null;
  return {
    id, gid,
    /** Whole workbook as xlsx. Sends the user's cookies, so private sheets they
     *  can already open work without any OAuth flow. */
    xlsxExport: `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`,
    /** Single-tab CSV fallback for link-shared sheets. */
    csvExport: (sheetName) => sheetName
      ? `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`
      : `https://docs.google.com/spreadsheets/d/${id}/export?format=csv${gid ? `&gid=${gid}` : ''}`,
  };
}

/** Validate an already-built table set against the schema, independent of source. */
export function validateTables(tables) {
  const problems = [], warnings = [];
  for (const [name, spec] of Object.entries(SHEETS)) {
    const rows = tables[name];
    if (!rows?.length) continue;
    const required = Object.entries(spec.columns).filter(([, c]) => c.required).map(([k]) => k);
    for (const k of required) {
      const missing = rows.filter((r) => r[k] === null || r[k] === undefined || r[k] === '').length;
      if (missing) problems.push(`${name}.${k}: ${missing} of ${rows.length} rows are blank in a required column`);
    }
    if (spec.key) {
      const seen = new Map();
      for (const r of rows) {
        const k = String(r[spec.key] ?? '').toUpperCase();
        if (!k) continue;
        seen.set(k, (seen.get(k) || 0) + 1);
      }
      const dupes = [...seen].filter(([, n]) => n > 1);
      // fundamentals and usage are panels (one row per year), and participants
      // legitimately spans several rows — one per collateral line. Repeated keys
      // there are the intended shape, not a mistake.
      const MULTI_ROW = new Set(['fundamentals', 'usage', 'participants']);
      if (dupes.length && !MULTI_ROW.has(name)) {
        warnings.push(`${name}: duplicate keys ${dupes.map(([k, n]) => `${k}(x${n})`).join(', ')}. Fields are merged across the rows, and where two rows both give a value the first one is kept — check they do not disagree.`);
      }
    }
  }
  // Cross-table referential checks.
  const known = new Set((tables.currencies || []).map((c) => String(c.code).toUpperCase()));
  if (known.size) {
    const refs = new Set();
    for (const t of tables.trades || []) { refs.add(String(t.sellerCurrency).toUpperCase()); refs.add(String(t.buyerCurrency).toUpperCase()); }
    const unknown = [...refs].filter((c) => c && c !== 'UNDEFINED' && !known.has(c) && c !== 'USD');
    if (unknown.length) warnings.push(`trades reference currencies absent from the Currencies sheet: ${unknown.join(', ')} — they cannot enter the basket, though they can still be priced if the fixing covers them`);
  }
  return { ok: problems.length === 0, problems, warnings };
}
