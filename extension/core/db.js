/**
 * db.js — SQLite (sql.js / WASM) with IndexedDB persistence.
 *
 * Everything the tool computes lands in a real relational database so that
 * results are queryable, diffable across runs, and exportable as a .sqlite file
 * a reviewer can open in any SQLite client. That matters more here than raw
 * speed: the framework's whole claim is replicability (§5).
 *
 * The database lives in the panel (a full extension page), not the service
 * worker, because MV3 workers are killed aggressively and WASM state would be
 * lost. Persistence is an explicit byte-blob write to IndexedDB after each
 * committed run.
 */

const IDB_NAME = 'mpcpi';
const IDB_STORE = 'blobs';
const DB_KEY = 'sqlite-db';

export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS run (
  run_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at   TEXT NOT NULL,
  label        TEXT,
  source       TEXT,              -- 'xlsx' | 'google-sheets' | 'csv' | 'sample'
  source_ref   TEXT,
  config_json  TEXT,
  notes        TEXT
);

CREATE TABLE IF NOT EXISTS currency (
  run_id INTEGER NOT NULL REFERENCES run(run_id) ON DELETE CASCADE,
  code TEXT NOT NULL, name TEXT, country TEXT,
  intra_network_trade_share REAL, gdp_share REAL, fx_liquidity REAL, convertibility REAL,
  policy_rate REAL, annual_vol REAL,
  PRIMARY KEY (run_id, code)
);

CREATE TABLE IF NOT EXISTS fx_quote (
  run_id INTEGER NOT NULL REFERENCES run(run_id) ON DELETE CASCADE,
  quote_id INTEGER, base TEXT NOT NULL, quote TEXT NOT NULL,
  rate REAL NOT NULL, bid REAL, ask REAL, spread_bps REAL,
  volume REAL, depth REAL, venue_tier INTEGER, ts TEXT,
  weight REAL, accepted INTEGER, reject_reason TEXT, residual_bps REAL
);
CREATE INDEX IF NOT EXISTS ix_fx_quote_run ON fx_quote(run_id, base, quote);

CREATE TABLE IF NOT EXISTS fixing (
  run_id INTEGER NOT NULL REFERENCES run(run_id) ON DELETE CASCADE,
  as_of TEXT, code TEXT NOT NULL, shadow_log_price REAL, standard_error REAL,
  provisional INTEGER DEFAULT 0,
  PRIMARY KEY (run_id, code)
);

CREATE TABLE IF NOT EXISTS fx_matrix (
  run_id INTEGER NOT NULL REFERENCES run(run_id) ON DELETE CASCADE,
  base TEXT NOT NULL, quote TEXT NOT NULL, rate REAL NOT NULL,
  PRIMARY KEY (run_id, base, quote)
);

CREATE TABLE IF NOT EXISTS basket (
  run_id INTEGER NOT NULL REFERENCES run(run_id) ON DELETE CASCADE,
  code TEXT NOT NULL, economic_score REAL, raw_weight REAL, final_weight REAL,
  quantity REAL, base_rate_vs_anchor REAL, capped INTEGER,
  anchor TEXT, base_date TEXT, base_value REAL,
  PRIMARY KEY (run_id, code)
);

CREATE TABLE IF NOT EXISTS metric (
  run_id INTEGER NOT NULL REFERENCES run(run_id) ON DELETE CASCADE,
  participant TEXT NOT NULL, block TEXT NOT NULL,   -- 'leading' | 'lagging'
  indicator TEXT NOT NULL, raw_value REAL, z REAL, score REAL, missing INTEGER,
  PRIMARY KEY (run_id, participant, indicator)
);

CREATE TABLE IF NOT EXISTS diagnostic (
  run_id INTEGER NOT NULL REFERENCES run(run_id) ON DELETE CASCADE,
  participant TEXT NOT NULL,
  chs REAL, price_stability REAL, fiscal_sustainability REAL,
  external_resilience REAL, monetary_financial REAL,
  cps REAL, coverage REAL, confidence TEXT,
  leading_index REAL, lagging_index REAL, composite REAL, divergence REAL, signal TEXT,
  band TEXT,
  PRIMARY KEY (run_id, participant)
);

CREATE TABLE IF NOT EXISTS excess_usage (
  run_id INTEGER NOT NULL REFERENCES run(run_id) ON DELETE CASCADE,
  currency TEXT NOT NULL, year TEXT, cps REAL, predicted REAL,
  excess_usage REAL, t_stat REAL, significant INTEGER,
  PRIMARY KEY (run_id, currency, year)
);

CREATE TABLE IF NOT EXISTS invoice (
  run_id INTEGER NOT NULL REFERENCES run(run_id) ON DELETE CASCADE,
  trade_id TEXT NOT NULL, description TEXT, exporter TEXT, importer TEXT,
  seller_ccy TEXT, buyer_ccy TEXT, settlement_days REAL, hedge_ratio REAL,
  base_local REAL, base_bcct REAL,
  invoice_bcct REAL, invoice_seller REAL, invoice_buyer REAL,
  spread_bps REAL, band TEXT, composite REAL,
  usd_all_in_buyer REAL, saving_buyer REAL, saving_bps REAL, cheaper_route TEXT,
  direct_infra_bps REAL, usd_infra_bps REAL, cheaper_infra TEXT,
  PRIMARY KEY (run_id, trade_id)
);

CREATE TABLE IF NOT EXISTS invoice_line (
  run_id INTEGER NOT NULL REFERENCES run(run_id) ON DELETE CASCADE,
  trade_id TEXT NOT NULL, line_key TEXT NOT NULL, label TEXT, section TEXT,
  amount_bcct REAL, amount_seller REAL, amount_buyer REAL, bps REAL, detail TEXT,
  PRIMARY KEY (run_id, trade_id, line_key)
);

CREATE TABLE IF NOT EXISTS netting_position (
  run_id INTEGER NOT NULL REFERENCES run(run_id) ON DELETE CASCADE,
  period TEXT, participant TEXT NOT NULL, net_position REAL, side TEXT,
  gross_payable REAL, gross_receivable REAL
);
CREATE INDEX IF NOT EXISTS ix_netpos ON netting_position(run_id, participant);

CREATE TABLE IF NOT EXISTS netting_summary (
  run_id INTEGER NOT NULL REFERENCES run(run_id) ON DELETE CASCADE,
  period TEXT, gross REAL, bilateral_net REAL, multilateral_net REAL,
  liquidity_saving_pct REAL, herfindahl REAL, largest_creditor TEXT, hub_risk TEXT
);

CREATE TABLE IF NOT EXISTS agent_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL, kind TEXT NOT NULL,     -- 'episodic' | 'semantic' | 'preference'
  topic TEXT, content TEXT NOT NULL, tokens INTEGER,
  importance REAL DEFAULT 0.5, uses INTEGER DEFAULT 0, last_used TEXT,
  run_id INTEGER
);
CREATE INDEX IF NOT EXISTS ix_mem ON agent_memory(kind, importance DESC);

CREATE TABLE IF NOT EXISTS agent_skill (
  name TEXT PRIMARY KEY,
  created_at TEXT NOT NULL, updated_at TEXT,
  kind TEXT NOT NULL,                                -- 'formula' | 'procedure' | 'prompt'
  description TEXT, spec_json TEXT NOT NULL,
  invocations INTEGER DEFAULT 0, successes INTEGER DEFAULT 0, failures INTEGER DEFAULT 0,
  reward REAL DEFAULT 0, status TEXT DEFAULT 'candidate',  -- candidate | promoted | retired
  origin TEXT
);

CREATE TABLE IF NOT EXISTS agent_trace (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL, session TEXT, role TEXT, provider TEXT, model TEXT,
  tool TEXT, input_tokens INTEGER, output_tokens INTEGER,
  latency_ms INTEGER, ok INTEGER, content TEXT
);

CREATE TABLE IF NOT EXISTS mcp_server (
  name TEXT PRIMARY KEY, url TEXT NOT NULL, transport TEXT,
  enabled INTEGER DEFAULT 1, added_at TEXT, last_ok TEXT, last_error TEXT,
  tools_json TEXT, auth_header TEXT
);
`;

/* ───────────────────────────── IndexedDB ───────────────────────────── */

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
    tx.onsuccess = () => resolve(tx.result ?? null);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbPut(key, value) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/* ───────────────────────────── the database ───────────────────────────── */

export class Store {
  constructor() { this.db = null; this.SQL = null; this.ready = false; this.dirty = false; }

  /** initSqlJs must already be on `globalThis` (vendor/sql-wasm.js loaded by the page). */
  async open({ wasmPath = '../vendor/' } = {}) {
    if (this.ready) return this;
    if (typeof globalThis.initSqlJs !== 'function') throw new Error('sql.js is not loaded — vendor/sql-wasm.js must be included before db.js is used');
    this.SQL = await globalThis.initSqlJs({ locateFile: (f) => `${wasmPath}${f}` });
    const saved = await idbGet(DB_KEY).catch(() => null);
    this.db = saved ? new this.SQL.Database(new Uint8Array(saved)) : new this.SQL.Database();
    this.db.run(SCHEMA_SQL);
    this.ready = true;
    return this;
  }

  run(sql, params = []) { this.db.run(sql, params); this.dirty = true; }

  /** SELECT returning plain objects. */
  all(sql, params = []) {
    const out = [];
    const stmt = this.db.prepare(sql);
    try {
      stmt.bind(params);
      while (stmt.step()) out.push(stmt.getAsObject());
    } finally { stmt.free(); }
    return out;
  }

  one(sql, params = []) { return this.all(sql, params)[0] ?? null; }

  /** Guarded query surface for the agent: reads only, single statement, capped. */
  safeQuery(sql, maxRows = 500) {
    const s = String(sql).trim().replace(/;\s*$/, '');
    if (/;/.test(s)) return { error: 'only a single statement is allowed' };
    if (!/^\s*(select|with)\b/i.test(s)) return { error: 'only SELECT and WITH queries are allowed' };
    if (/\b(attach|pragma|insert|update|delete|drop|alter|create|replace|vacuum|load_extension)\b/i.test(s)) {
      return { error: 'that statement contains a disallowed keyword' };
    }
    try {
      const rows = this.all(`SELECT * FROM (${s}) LIMIT ${Math.min(maxRows, 5000)}`);
      return { rows, rowCount: rows.length, truncated: rows.length >= Math.min(maxRows, 5000) };
    } catch (e) {
      return { error: String(e.message || e) };
    }
  }

  transaction(fn) {
    this.db.run('BEGIN');
    try { const r = fn(this); this.db.run('COMMIT'); this.dirty = true; return r; }
    catch (e) { try { this.db.run('ROLLBACK'); } catch {} throw e; }
  }

  insertMany(table, columns, rows) {
    if (!rows?.length) return 0;
    const sql = `INSERT OR REPLACE INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`;
    const stmt = this.db.prepare(sql);
    try {
      for (const r of rows) {
        stmt.run(columns.map((c) => {
          const v = r[c];
          if (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v))) return null;
          if (typeof v === 'boolean') return v ? 1 : 0;
          if (typeof v === 'object') return JSON.stringify(v);
          return v;
        }));
        stmt.reset();
      }
    } finally { stmt.free(); }
    this.dirty = true;
    return rows.length;
  }

  async persist(force = false) {
    if (!this.ready || (!this.dirty && !force)) return false;
    await idbPut(DB_KEY, this.db.export());
    this.dirty = false;
    return true;
  }

  export() { return this.db.export(); }

  async reset() {
    this.db?.close();
    this.db = new this.SQL.Database();
    this.db.run(SCHEMA_SQL);
    this.dirty = true;
    await this.persist(true);
  }

  tableStats() {
    const names = this.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    return names.map(({ name }) => ({ table: name, rows: this.one(`SELECT COUNT(*) AS n FROM ${name}`)?.n ?? 0 }));
  }
}

/** Persist one complete analysis run. Returns the run_id. */
export function commitRun(store, { label, source, sourceRef, config, results }) {
  return store.transaction((s) => {
    s.run('INSERT INTO run (started_at, label, source, source_ref, config_json) VALUES (?,?,?,?,?)',
      [new Date().toISOString(), label ?? null, source ?? null, sourceRef ?? null, JSON.stringify(config ?? {})]);
    const runId = s.one('SELECT last_insert_rowid() AS id').id;

    const { fixing, basket, diagnostics, invoices, netting, currencies, excessUsage: eu } = results;

    if (currencies?.length) s.insertMany('currency',
      ['run_id', 'code', 'name', 'country', 'intra_network_trade_share', 'gdp_share', 'fx_liquidity', 'convertibility', 'policy_rate', 'annual_vol'],
      currencies.map((c) => ({ run_id: runId, code: String(c.code).toUpperCase(), name: c.name, country: c.country, intra_network_trade_share: c.intraNetworkTradeShare, gdp_share: c.gdpShare, fx_liquidity: c.fxLiquidity, convertibility: c.convertibility, policy_rate: c.policyRate, annual_vol: c.annualVol })));

    if (fixing?.ok) {
      s.insertMany('fixing', ['run_id', 'as_of', 'code', 'shadow_log_price', 'standard_error', 'provisional'],
        fixing.currencies.map((c) => ({ run_id: runId, as_of: fixing.asOf, code: c, shadow_log_price: fixing.shadowLogPrices[c], standard_error: fixing.shadowPriceSE[c], provisional: (fixing.provisional || []).includes(c) ? 1 : 0 })));
      const mrows = [];
      for (const a of fixing.currencies) for (const b of fixing.currencies) if (a !== b) mrows.push({ run_id: runId, base: a, quote: b, rate: fixing.rate(a, b) });
      s.insertMany('fx_matrix', ['run_id', 'base', 'quote', 'rate'], mrows);
      s.insertMany('fx_quote', ['run_id', 'base', 'quote', 'rate', 'weight', 'accepted', 'residual_bps'],
        (fixing.diagnostics.residuals || []).map((r) => ({ run_id: runId, base: r.pair.split('/')[0], quote: r.pair.split('/')[1], rate: r.observed, weight: r.weight, accepted: 1, residual_bps: r.residualBps })));
      s.insertMany('fx_quote', ['run_id', 'base', 'quote', 'rate', 'accepted', 'reject_reason', 'residual_bps'],
        (fixing.diagnostics.outliers || []).map((o) => ({ run_id: runId, base: o.base, quote: o.quote, rate: o.rate, accepted: 0, reject_reason: `outlier z=${o.z}`, residual_bps: o.residualBps })));
    }

    if (basket && !basket.error) s.insertMany('basket',
      ['run_id', 'code', 'economic_score', 'raw_weight', 'final_weight', 'quantity', 'base_rate_vs_anchor', 'capped', 'anchor', 'base_date', 'base_value'],
      basket.components.map((c) => ({ run_id: runId, code: c.code, economic_score: c.economicScore, raw_weight: c.rawWeight, final_weight: c.finalWeight, quantity: c.quantity, base_rate_vs_anchor: c.baseRateVsAnchor, capped: c.capped ? 1 : 0, anchor: basket.anchor, base_date: basket.baseDate, base_value: basket.baseValue })));

    if (diagnostics?.length) {
      s.insertMany('diagnostic',
        ['run_id', 'participant', 'chs', 'price_stability', 'fiscal_sustainability', 'external_resilience', 'monetary_financial', 'cps', 'coverage', 'confidence', 'leading_index', 'lagging_index', 'composite', 'divergence', 'signal', 'band'],
        diagnostics.map((d) => ({ run_id: runId, participant: d.participant, chs: d.health?.chs, price_stability: d.health?.blocks?.priceStability?.score, fiscal_sustainability: d.health?.blocks?.fiscalSustainability?.score, external_resilience: d.health?.blocks?.externalResilience?.score, monetary_financial: d.health?.blocks?.monetaryFinancialResilience?.score, cps: d.power?.cps, coverage: d.health?.coverage, confidence: d.health?.confidence, leading_index: d.composite?.leading, lagging_index: d.composite?.lagging, composite: d.composite?.index, divergence: d.composite?.divergence, signal: d.composite?.signal, band: d.band?.band })));
      const mrows = [];
      for (const d of diagnostics) for (const r of d.scored?.rows || []) {
        mrows.push({ run_id: runId, participant: d.participant, block: r.block, indicator: r.key, raw_value: r.value, z: r.z, score: r.score, missing: r.missing ? 1 : 0 });
      }
      s.insertMany('metric', ['run_id', 'participant', 'block', 'indicator', 'raw_value', 'z', 'score', 'missing'], mrows);
    }

    if (eu && !eu.error) s.insertMany('excess_usage',
      ['run_id', 'currency', 'year', 'cps', 'predicted', 'excess_usage', 't_stat', 'significant'],
      eu.observations.map((o) => ({ run_id: runId, currency: o.currency, year: String(o.year), cps: o.cps, predicted: o.predicted, excess_usage: o.excessUsage, t_stat: o.tStat, significant: o.significant ? 1 : 0 })));

    if (invoices?.length) {
      s.insertMany('invoice',
        ['run_id', 'trade_id', 'description', 'exporter', 'importer', 'seller_ccy', 'buyer_ccy', 'settlement_days', 'hedge_ratio', 'base_local', 'base_bcct', 'invoice_bcct', 'invoice_seller', 'invoice_buyer', 'spread_bps', 'band', 'composite', 'usd_all_in_buyer', 'saving_buyer', 'saving_bps', 'cheaper_route', 'direct_infra_bps', 'usd_infra_bps', 'cheaper_infra'],
        invoices.filter((i) => !i.error).map((i) => ({ run_id: runId, trade_id: i.tradeId, description: i.description, exporter: i.exporter, importer: i.importer, seller_ccy: i.sellerCurrency, buyer_ccy: i.buyerCurrency, settlement_days: i.settlementDays, hedge_ratio: i.hedgeRatio, base_local: i.base.local, base_bcct: i.base.bcct, invoice_bcct: i.invoicePrice.bcct, invoice_seller: i.invoicePrice.inSellerCurrency, invoice_buyer: i.invoicePrice.inBuyerCurrency, spread_bps: i.invoicePrice.spreadOverBaseBps, band: i.band?.code, composite: i.composite?.index, usd_all_in_buyer: i.comparison?.usdAllInBuyer, saving_buyer: i.comparison?.savingBuyerCurrency, saving_bps: i.comparison?.savingBps, cheaper_route: i.comparison?.cheaperRoute, direct_infra_bps: i.comparison?.differential?.directInfrastructureBps, usd_infra_bps: i.comparison?.differential?.usdInfrastructureBps, cheaper_infra: i.comparison?.cheaperInfrastructure })));
      const lrows = [];
      for (const i of invoices.filter((x) => !x.error)) for (const l of i.lines) {
        lrows.push({ run_id: runId, trade_id: i.tradeId, line_key: l.key, label: l.label, section: l.section, amount_bcct: l.amountBCCT, amount_seller: l.amountSeller, amount_buyer: l.amountBuyer, bps: l.bps, detail: l.detail ?? null });
      }
      s.insertMany('invoice_line', ['run_id', 'trade_id', 'line_key', 'label', 'section', 'amount_bcct', 'amount_seller', 'amount_buyer', 'bps', 'detail'], lrows);
    }

    if (netting) {
      const periods = netting.periods || [netting];
      s.insertMany('netting_summary', ['run_id', 'period', 'gross', 'bilateral_net', 'multilateral_net', 'liquidity_saving_pct', 'herfindahl', 'largest_creditor', 'hub_risk'],
        periods.map((p) => ({ run_id: runId, period: p.period ?? null, gross: p.grossSettlement, bilateral_net: p.bilateralNetSettlement, multilateral_net: p.netSettlement, liquidity_saving_pct: p.liquiditySavingPercent, herfindahl: p.concentration?.herfindahl, largest_creditor: p.concentration?.largestCreditor, hub_risk: p.concentration?.hubRisk })));
      const prows = [];
      for (const p of periods) for (const pos of p.positions || []) {
        prows.push({ run_id: runId, period: p.period ?? null, participant: pos.participant, net_position: pos.netPosition, side: pos.side, gross_payable: pos.grossPayable, gross_receivable: pos.grossReceivable });
      }
      s.insertMany('netting_position', ['run_id', 'period', 'participant', 'net_position', 'side', 'gross_payable', 'gross_receivable'], prows);
    }

    return runId;
  });
}

/** Queries the agent is allowed to suggest, and the UI uses for its charts. */
export const CANNED_QUERIES = {
  latestRun: 'SELECT * FROM run ORDER BY run_id DESC LIMIT 1',
  invoiceSpreadByTrade: `SELECT trade_id, seller_ccy, buyer_ccy, settlement_days, spread_bps, saving_bps, cheaper_route
                         FROM invoice WHERE run_id = (SELECT MAX(run_id) FROM invoice) ORDER BY spread_bps DESC`,
  routeComparison: `SELECT trade_id, seller_ccy, buyer_ccy, settlement_days, band,
                           direct_infra_bps, usd_infra_bps,
                           usd_infra_bps - direct_infra_bps AS infra_difference_bps, cheaper_infra
                    FROM invoice WHERE run_id = (SELECT MAX(run_id) FROM invoice)
                    ORDER BY infra_difference_bps DESC`,
  componentContribution: `SELECT line_key, label, section, SUM(amount_bcct) AS total_bcct, AVG(bps) AS avg_bps
                          FROM invoice_line WHERE run_id = (SELECT MAX(run_id) FROM invoice_line) AND line_key <> 'base'
                          GROUP BY line_key ORDER BY ABS(SUM(amount_bcct)) DESC`,
  leadingVsLagging: `SELECT participant, leading_index, lagging_index, composite, divergence, signal, band
                     FROM diagnostic WHERE run_id = (SELECT MAX(run_id) FROM diagnostic) ORDER BY divergence ASC`,
  nettingTrend: `SELECT period, gross, multilateral_net, liquidity_saving_pct, herfindahl
                 FROM netting_summary WHERE run_id = (SELECT MAX(run_id) FROM netting_summary)`,
  persistentPositions: `SELECT participant, COUNT(*) AS periods, AVG(net_position) AS avg_net, SUM(net_position) AS cumulative
                        FROM netting_position WHERE run_id = (SELECT MAX(run_id) FROM netting_position)
                        GROUP BY participant ORDER BY cumulative DESC`,
  basketWeights: `SELECT code, raw_weight, final_weight, quantity, capped FROM basket
                  WHERE run_id = (SELECT MAX(run_id) FROM basket) ORDER BY final_weight DESC`,
  excessUsageRanking: `SELECT currency, AVG(excess_usage) AS mean_excess, COUNT(*) AS n
                       FROM excess_usage WHERE run_id = (SELECT MAX(run_id) FROM excess_usage)
                       GROUP BY currency ORDER BY mean_excess DESC`,
  rejectedQuotes: `SELECT base, quote, rate, reject_reason, residual_bps FROM fx_quote
                   WHERE run_id = (SELECT MAX(run_id) FROM fx_quote) AND accepted = 0`,
};
