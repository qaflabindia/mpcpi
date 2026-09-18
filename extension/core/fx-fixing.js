/**
 * fx-fixing.js — §8 and §9 of the BCC framework.
 *
 * Estimates one shadow log-price p_i per currency from a pool of observed
 * bilateral quotes by weighted least squares:
 *
 *     min_p  SUM_q  w_q * [ ln(FX_obs,q) - (p_i(q) - p_j(q)) ]^2
 *
 * The normal equations are a weighted graph Laplacian, L p = b. L is singular
 * on the constant vector, which is exactly the gauge freedom the paper notes
 * ("only relative prices matter"). We fix the gauge with SUM_i p_i = 0 by
 * solving (L + alpha * 11^T) p = b, which is non-singular and returns the
 * zero-sum solution because 1^T b = 0 holds by construction.
 *
 * Every rate is then FX_ij = exp(p_i - p_j), so triangular consistency and
 * reciprocal consistency hold identically rather than approximately.
 *
 * Convention: rate for pair (base=i, quote=j) means 1 unit of i buys `rate`
 * units of j, i.e. FX_ij = rate.
 *
 * TWO STAGES, and the separation is the point (§37).
 *
 * Pooling every quote into one fit lets the vehicle currency decide the
 * internal matrix. Its legs are the deepest and tightest in any real quote set,
 * so they carry most of the fitting weight, and a direct participating cross
 * that disagrees with the vehicle-implied value is first outvoted and then
 * discarded by the outlier rule FOR disagreeing. The published "participating
 * cross rates" are then the vehicle's rates under another name, and any claim of
 * measurement independence is false.
 *
 *   Stage 1  Participating currencies are fitted from quotes whose BOTH legs are
 *            participating. No external quote enters this system at all, so the
 *            internal matrix is independent of the vehicle by construction
 *            rather than by assertion.
 *
 *   Stage 2  External currencies are attached as satellites: their shadow prices
 *            are estimated against the participant block with the participant
 *            prices HELD FIXED. USD can be quoted and paid; it cannot move the
 *            internal matrix.
 *
 * If the participating quote graph is disconnected, that is reported as a real
 * finding — the network cannot yet measure itself — and not repaired by
 * readmitting the vehicle.
 */

import { num, isNum, mean, median, mad, sum, inverse, solve, clamp, round } from './num.js';

/** Default weighting policy — §8: "mechanical functions of executable volume,
 *  bid-ask spread, market depth, quote age and venue quality". */
export const DEFAULT_WEIGHT_POLICY = {
  volumeRef: 1e6,        // notional at which the volume term reaches ~1
  spreadRefBps: 5,       // bid-ask spread (bps) at which the spread term halves
  depthRef: 5e5,
  stalenessHalfLifeSec: 300,
  maxAgeSec: 1800,       // §9 staleness threshold: older quotes are rejected
  venueTierWeight: { 1: 1.0, 2: 0.7, 3: 0.4 },
  minQuotesPerCurrency: 2,
  outlierK: 6.0,          // reject |standardised residual| > k after the robust fit
  huberDelta: 1.5,        // Huber tuning constant for the IRLS passes
  irlsIterations: 8,
  minResidualScaleBps: 2, // floor on the robust residual scale (see robustScale)
};

export const FIXING_SOURCE = {
  DIRECT: 'direct-executable',
  SYNTHETIC: 'synthetic-cross',
  CARRIED: 'carried-forward-fixing',
  DISRUPTION: 'market-disruption',
};

/**
 * Compute a reliability weight for one quote. All terms are in [0,1] and
 * multiplicative, so a quote fails on its worst dimension.
 */
export function quoteWeight(q, policy = DEFAULT_WEIGHT_POLICY, nowMs = Date.now()) {
  const vol = Math.max(0, num(q.volume, 0));
  const depth = Math.max(0, num(q.depth, vol));
  const bid = num(q.bid, NaN), ask = num(q.ask, NaN), rate = num(q.rate, NaN);
  let spreadBps = num(q.spreadBps, NaN);
  if (!isNum(spreadBps) && isNum(bid) && isNum(ask) && ask > 0 && bid > 0) {
    spreadBps = ((ask - bid) / ((ask + bid) / 2)) * 1e4;
  }
  if (!isNum(spreadBps)) spreadBps = policy.spreadRefBps * 2;

  const tsMs = q.ts ? (typeof q.ts === 'number' ? q.ts : Date.parse(q.ts)) : nowMs;
  const ageSec = Number.isFinite(tsMs) ? Math.max(0, (nowMs - tsMs) / 1000) : 0;

  if (!isNum(rate) || rate <= 0) return { w: 0, reject: 'non-positive rate' };
  if (ageSec > policy.maxAgeSec) return { w: 0, reject: `stale (${Math.round(ageSec)}s > ${policy.maxAgeSec}s)`, ageSec };

  const wVolume = vol > 0 ? vol / (vol + policy.volumeRef) * 2 : 0.25;
  const wSpread = policy.spreadRefBps / (policy.spreadRefBps + Math.max(0, spreadBps));
  const wDepth = depth > 0 ? depth / (depth + policy.depthRef) * 2 : 0.5;
  const wAge = Math.pow(0.5, ageSec / policy.stalenessHalfLifeSec);
  const wVenue = policy.venueTierWeight[num(q.venueTier, 2)] ?? 0.5;
  const wManual = clamp(num(q.weight, 1), 0, 10);

  const w = clamp(wVolume, 0, 1.5) * wSpread * clamp(wDepth, 0, 1.5) * wAge * wVenue * wManual;
  return { w: Math.max(w, 0), ageSec, spreadBps, parts: { wVolume, wSpread, wDepth, wAge, wVenue } };
}

/** Connected components over the quote graph — disconnected currencies cannot be fixed. */
function components(codes, edges) {
  const idx = new Map(codes.map((c, i) => [c, i]));
  const parent = codes.map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (const [i, j] of edges) union(idx.get(i), idx.get(j));
  const groups = new Map();
  codes.forEach((c, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(c);
  });
  return [...groups.values()].sort((a, b) => b.length - a.length);
}

function wlsShadowPrices(codes, obs) {
  const n = codes.length;
  const idx = new Map(codes.map((c, i) => [c, i]));
  const L = Array.from({ length: n }, () => new Float64Array(n));
  const b = new Float64Array(n);
  for (const o of obs) {
    const i = idx.get(o.base), j = idx.get(o.quote);
    if (i === undefined || j === undefined) continue;
    const w = o.w, y = o.y;
    L[i][i] += w; L[j][j] += w; L[i][j] -= w; L[j][i] -= w;
    b[i] += w * y; b[j] -= w * y;
  }
  // Gauge fix: SUM p = 0 via L + alpha*J.
  const alpha = Math.max(1e-6, mean(Array.from({ length: n }, (_, i) => L[i][i])) || 1);
  const A = L.map((row) => Array.from(row));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) A[i][j] += alpha;
  const p = solve(A.map((r) => [...r]), b);
  if (!p) return null;
  // Covariance: (L + alpha J)^-1 = L^+ + J/(alpha n^2)  =>  L^+ = inv - J/(alpha n^2).
  const Ainv = inverse(A);
  const lplusDiag = Ainv ? Array.from({ length: n }, (_, i) => Math.max(0, Ainv[i][i] - 1 / (alpha * n * n))) : null;
  return { p, lplusDiag, alpha };
}

/**
 * Run a fixing.
 * @param {Array} quotes  [{base, quote, rate, bid, ask, volume, depth, venueTier, ts, weight}]
 * @param {Object} opts   {policy, currencies, nowMs, anchor}
 */
export function runFixing(quotes, opts = {}) {
  const policy = { ...DEFAULT_WEIGHT_POLICY, ...(opts.policy || {}) };

  /**
   * The reference instant for staleness.
   *
   * §9 rejects quotes older than the threshold, but that rule describes a LIVE
   * fixing window — quotes stale relative to the fixing being struck. Measuring
   * against wall-clock instead would mean a workbook of yesterday's quotes fixes
   * nothing at all, which is useless for exactly the historical analysis §20 and
   * §34 ask for. So the window is anchored to the most recent quote in the batch
   * unless the caller names an instant, and staleness is then judged within the
   * batch, which is what the rule is actually for.
   */
  const stamps = (quotes || [])
    .map((q) => (q?.ts == null ? NaN : (typeof q.ts === 'number' ? q.ts : Date.parse(q.ts))))
    .filter(Number.isFinite);
  const dataAsOf = stamps.length ? Math.max(...stamps) : null;
  const nowMs = opts.nowMs ?? dataAsOf ?? Date.now();
  const wallClockLagMs = dataAsOf === null ? 0 : Date.now() - dataAsOf;

  const rejected = [];
  const scored = [];

  for (const q of quotes || []) {
    const base = String(q.base || q.from || '').trim().toUpperCase();
    const quote = String(q.quote || q.to || '').trim().toUpperCase();
    const rate = num(q.rate ?? q.price ?? q.mid, NaN);
    if (!base || !quote || base === quote) { rejected.push({ q, reason: 'malformed pair' }); continue; }
    const scoreRes = quoteWeight({ ...q, rate }, policy, nowMs);
    if (!(scoreRes.w > 0)) { rejected.push({ q, reason: scoreRes.reject || 'zero weight' }); continue; }
    scored.push({ base, quote, rate, y: Math.log(rate), w: scoreRes.w, meta: scoreRes, raw: q });
  }

  const declared = (opts.currencies || []).map((c) => String(c).toUpperCase());
  const seen = new Set(scored.flatMap((o) => [o.base, o.quote]));
  const codes = [...new Set([...declared.filter((c) => seen.has(c)), ...seen])].sort();

  /**
   * The participating network. Defaults to the declared currency list, which is
   * the Currencies sheet — i.e. the basket members. Everything else is external
   * and becomes a satellite.
   */
  const participantSet = new Set(
    (opts.participants ? opts.participants.map((c) => String(c).toUpperCase()) : declared).filter((c) => seen.has(c)),
  );
  const isParticipant = (c) => participantSet.has(c);
  const externalCodes = codes.filter((c) => !isParticipant(c));

  if (codes.length < 2) {
    const stale = rejected.filter((r) => /stale/.test(r.reason || '')).length;
    return {
      ok: false,
      status: FIXING_SOURCE.DISRUPTION,
      reason: stale
        ? `fewer than two currencies have qualifying quotes — ${stale} of ${(quotes || []).length} were rejected as stale relative to the newest quote in the file. Check that the timestamp column parsed correctly.`
        : 'fewer than two currencies have qualifying quotes',
      codes, rejected,
    };
  }

  // Stage 1 operates on the internal graph only: both legs participating.
  const internalQuotes = participantSet.size >= 2
    ? scored.filter((o) => isParticipant(o.base) && isParticipant(o.quote))
    : scored;
  const stage1Codes = participantSet.size >= 2 ? [...participantSet].sort() : codes;

  const comps = components(stage1Codes, internalQuotes.map((o) => [o.base, o.quote]));
  const main = comps[0] ?? [];
  const orphans = comps.slice(1).flat();
  const inMain = new Set(main);
  const usable = internalQuotes.filter((o) => inMain.has(o.base) && inMain.has(o.quote));

  if (main.length < 2) {
    return {
      ok: false,
      status: FIXING_SOURCE.DISRUPTION,
      reason: participantSet.size >= 2
        ? `the participating currencies are not connected by direct quotes — ${stage1Codes.join(', ')} cannot be measured against each other without routing through an external currency. That is a finding about the network, not a data error: supply quotes for the participating crosses.`
        : 'fewer than two currencies have qualifying quotes',
      codes, participants: [...participantSet], external: externalCodes, rejected,
    };
  }

  // §9: minimum independent quotations per currency.
  const perCcy = new Map(main.map((c) => [c, 0]));
  for (const o of usable) { perCcy.set(o.base, perCcy.get(o.base) + 1); perCcy.set(o.quote, perCcy.get(o.quote) + 1); }
  const thin = [...perCcy.entries()].filter(([, k]) => k < policy.minQuotesPerCurrency).map(([c]) => c);

  // Pass 1: plain weighted least squares.
  let fit = wlsShadowPrices(main, usable);
  if (!fit) return { ok: false, status: FIXING_SOURCE.DISRUPTION, reason: 'normal equations are singular', codes, rejected };

  const idx = new Map(main.map((c, i) => [c, i]));
  const residOf = (p, set) => set.map((o) => o.y - (p[idx.get(o.base)] - p[idx.get(o.quote)]));

  /**
   * Robust residual scale. MAD alone collapses to ~0 whenever a majority of
   * quotes sit on spanning-tree edges that the fit reproduces exactly, which
   * would make every genuine quote look like an outlier. The scale is therefore
   * floored at the typical half-spread of the sample: a fixing cannot resolve
   * a price more finely than the market quotes it.
   */
  const halfSpreads = usable.map((o) => (o.meta.spreadBps ?? policy.spreadRefBps) / 2e4).filter(Number.isFinite);
  const spreadFloor = halfSpreads.length ? median(halfSpreads) : policy.spreadRefBps / 2e4;
  const robustScale = (r) => Math.max(mad(r) || 0, spreadFloor, policy.minResidualScaleBps / 1e4);

  // IRLS with Huber weights: pulls the fit away from contaminated quotes before
  // any hard rejection decision is taken, so a good quote adjacent to a bad one
  // is not rejected merely for being near it.
  let work = usable.map((o) => ({ ...o, w0: o.w }));
  let resid = residOf(fit.p, work);
  for (let it = 0; it < policy.irlsIterations; it++) {
    const s = robustScale(resid);
    work = work.map((o, i) => {
      const a = Math.abs(resid[i] / s);
      const huber = a <= policy.huberDelta ? 1 : policy.huberDelta / a;
      return { ...o, w: o.w0 * huber };
    });
    const next = wlsShadowPrices(main, work.filter((o) => o.w > 0));
    if (!next) break;
    const delta = Math.max(...main.map((_, k) => Math.abs(next.p[k] - fit.p[k])));
    fit = next;
    resid = residOf(fit.p, work);
    if (delta < 1e-10) break;
  }

  // §9 mechanical outlier rule, applied against the robust fit.
  const scale = robustScale(resid);
  const outliers = [];
  const pass2 = work.map((o, i) => {
    const z = resid[i] / scale;
    if (Math.abs(z) > policy.outlierK) {
      outliers.push({ pair: `${o.base}/${o.quote}`, base: o.base, quote: o.quote, rate: o.rate, residualBps: round(resid[i] * 1e4, 2), z: round(z, 2), venueTier: o.raw.venueTier ?? null });
      return null;
    }
    return { ...o, w: o.w0 };   // restore full weight for the final fit
  }).filter(Boolean);

  if (pass2.length >= main.length - 1) {
    const finalFit = wlsShadowPrices(main, pass2);
    if (finalFit) fit = finalFit;
  }
  resid = residOf(fit.p, pass2);

  const wUsed = pass2.reduce((s, o) => s + o.w, 0);
  const wrss = pass2.reduce((s, o, i) => {
    const r = o.y - (fit.p[idx.get(o.base)] - fit.p[idx.get(o.quote)]);
    return s + o.w * r * r;
  }, 0);
  const dof = Math.max(1, pass2.length - (main.length - 1));
  const sigma2 = wrss / dof;
  const se = fit.lplusDiag ? main.map((_, i) => Math.sqrt(sigma2 * fit.lplusDiag[i])) : main.map(() => NaN);

  const p = Object.fromEntries(main.map((c, i) => [c, fit.p[i]]));
  const seByCcy = Object.fromEntries(main.map((c, i) => [c, se[i]]));

  /**
   * ── Stage 2: external currencies as satellites ──────────────────────────
   *
   * Participant prices are constants here. Each external price is solved from
   * the quotes that connect it to the already-fixed block (and to other
   * externals), so an external currency is quotable and payable but has no
   * influence whatsoever on the internal matrix.
   */
  const satellite = {};
  const satelliteDiag = [];
  if (externalCodes.length) {
    const bridge = scored.filter((o) => {
      const bp = isParticipant(o.base), qp = isParticipant(o.quote);
      if (bp && qp) return false;                       // already used in stage 1
      if (bp && !inMain.has(o.base)) return false;      // anchored to an orphan
      if (qp && !inMain.has(o.quote)) return false;
      return true;
    });

    // Iterate: externals adjacent to the fixed block resolve first, then
    // externals that only connect through other externals.
    const pending = new Set(externalCodes);
    const known = (c) => (isParticipant(c) ? p[c] : satellite[c]?.price);
    for (let pass = 0; pass < externalCodes.length + 1 && pending.size; pass++) {
      let progressed = false;
      for (const e of [...pending]) {
        let num = 0, den = 0, n = 0;
        const legs = [];
        for (const o of bridge) {
          let other = null, sign = 0;
          if (o.base === e) { other = o.quote; sign = +1; }
          else if (o.quote === e) { other = o.base; sign = -1; }
          else continue;
          const po = known(other);
          if (po === undefined) continue;
          // y = ln FX_base,quote = p_base - p_quote  =>  p_e = p_other + sign*y
          const implied = po + sign * o.y;
          num += o.w * implied; den += o.w; n++;
          legs.push({ vs: other, observed: o.rate, weight: round(o.w, 5) });
        }
        if (den > 0) {
          const price = num / den;
          const wrss = bridge.reduce((acc, o) => {
            if (o.base !== e && o.quote !== e) return acc;
            const other = o.base === e ? o.quote : o.base;
            const po = known(other);
            if (po === undefined) return acc;
            const sign = o.base === e ? +1 : -1;
            const r = (po + sign * o.y) - price;
            return acc + o.w * r * r;
          }, 0);
          satellite[e] = { price, n, se: n > 1 ? Math.sqrt(wrss / (den * (n - 1))) : NaN };
          satelliteDiag.push({ code: e, quotesUsed: n, legs, standardError: round(satellite[e].se, 6) });
          pending.delete(e);
          progressed = true;
        }
      }
      if (!progressed) break;
    }
    for (const e of pending) satelliteDiag.push({ code: e, quotesUsed: 0, error: 'no qualifying quote connects it to the participating network' });
  }

  const priceOf = (c) => (c in p ? p[c] : satellite[c]?.price);
  const published = [...main, ...externalCodes.filter((e) => satellite[e])];

  const rate = (i, j) => {
    i = String(i).toUpperCase(); j = String(j).toUpperCase();
    if (i === j) return 1;
    const pi = priceOf(i), pj = priceOf(j);
    if (pi === undefined || pj === undefined) return NaN;
    return Math.exp(pi - pj);
  };

  // Raw triangular inconsistency actually present in the input, for reporting.
  let maxRawTriangleBps = 0, worstTriangle = null;
  const rawMid = new Map();
  for (const o of usable) rawMid.set(`${o.base}/${o.quote}`, o.rate);
  for (const a of main) for (const b of main) for (const c of main) {
    if (a === b || b === c || a === c) continue;
    const ab = rawMid.get(`${a}/${b}`), bc = rawMid.get(`${b}/${c}`), ac = rawMid.get(`${a}/${c}`);
    if (!ab || !bc || !ac) continue;
    const bps = Math.abs(Math.log((ab * bc) / ac)) * 1e4;
    if (bps > maxRawTriangleBps) { maxRawTriangleBps = bps; worstTriangle = [a, b, c, round(bps, 2)]; }
  }

  const matrixOut = {};
  for (const i of published) { matrixOut[i] = {}; for (const j of published) matrixOut[i][j] = rate(i, j); }

  /**
   * Conversion cost, in basis points, of actually trading i into j.
   *
   * The fixing tells you the mid. It does not tell you what crossing the spread
   * costs, and that is the whole economics of a thin market: a cross with no
   * direct quote has to be executed through a bridge currency and pays both
   * legs. Dijkstra over the quote graph with the observed half-spread as the
   * edge weight gives the cheapest executable path, so a currency pair the
   * user's own data quotes badly is priced badly.
   */
  const spreadEdges = new Map();
  for (const o of [...pass2, ...scored.filter((o) => !isParticipant(o.base) || !isParticipant(o.quote))]) {
    const bps = Number.isFinite(o.meta.spreadBps) ? o.meta.spreadBps : policy.spreadRefBps * 2;
    const k1 = `${o.base}|${o.quote}`, k2 = `${o.quote}|${o.base}`;
    for (const k of [k1, k2]) if (!(spreadEdges.get(k) <= bps)) spreadEdges.set(k, bps);
  }

  const pathCache = new Map();
  /**
   * @param {Object} opts {exclude: [codes]} — currencies the path may not
   *   transit. Passing the incumbent vehicle currency here is how the BCC route
   *   is costed: it must clear inside the participating network, and if that
   *   network's own markets are thin it pays for it.
   */
  function conversionPath(a, b, opts = {}) {
    a = String(a).toUpperCase(); b = String(b).toUpperCase();
    if (a === b) return { bps: 0, path: [a], direct: true, legs: 0 };
    const exclude = new Set((opts.exclude || []).map((c) => String(c).toUpperCase()));
    exclude.delete(a); exclude.delete(b);          // endpoints are never transit
    const ck = `${a}|${b}|${[...exclude].sort().join(',')}`;
    if (pathCache.has(ck)) return pathCache.get(ck);
    const nodes = published.filter((c) => !exclude.has(c));
    if (!nodes.includes(a) || !nodes.includes(b)) {
      const miss = { bps: NaN, path: null, direct: false, note: `${!nodes.includes(a) ? a : b} is not in the fixing` };
      pathCache.set(ck, miss);
      return miss;
    }
    const dist = new Map(nodes.map((c) => [c, Infinity]));
    const prev = new Map();
    dist.set(a, 0);
    const unvisited = new Set(nodes);
    while (unvisited.size) {
      let u = null, best = Infinity;
      for (const c of unvisited) if (dist.get(c) < best) { best = dist.get(c); u = c; }
      if (u === null) break;
      unvisited.delete(u);
      if (u === b) break;
      for (const v of unvisited) {
        const w = spreadEdges.get(`${u}|${v}`);
        if (w === undefined) continue;
        // Half-spread each side of the mid: one crossing costs half the quoted spread.
        if (best + w / 2 < dist.get(v)) { dist.set(v, best + w / 2); prev.set(v, u); }
      }
    }
    let out;
    if (!Number.isFinite(dist.get(b))) {
      out = { bps: NaN, path: null, direct: false, note: `no executable path from ${a} to ${b}${exclude.size ? ` without transiting ${[...exclude].join(', ')}` : ''}` };
    } else {
      const path = [b];
      while (prev.has(path[0])) path.unshift(prev.get(path[0]));
      out = { bps: dist.get(b), path, direct: path.length === 2, legs: path.length - 1 };
    }
    pathCache.set(ck, out);
    return out;
  }

  const provisional = thin.slice();
  const warnings = [];
  if (opts.nowMs === undefined && wallClockLagMs > 2 * 3600 * 1000) {
    const h = wallClockLagMs / 3.6e6;
    warnings.push(`These quotes are ${h < 48 ? `${h.toFixed(1)} hours` : `${(h / 24).toFixed(1)} days`} old. The fixing was struck as of the newest quote in the file rather than the current time, so the result is a historical fixing — correct for analysis, not a live rate.`);
  }
  if (orphans.length) warnings.push(`disconnected from the main quote graph, no fixing produced: ${orphans.join(', ')}`);
  if (thin.length) warnings.push(`below the ${policy.minQuotesPerCurrency}-quote minimum (§9), fixed but flagged: ${thin.join(', ')}`);
  if (outliers.length) warnings.push(`${outliers.length} quote(s) rejected by the outlier rule (|z| > ${policy.outlierK})`);
  if (maxRawTriangleBps > 25) warnings.push(`input quotes violate triangular consistency by up to ${round(maxRawTriangleBps, 1)} bps; the fixing resolves this by construction`);

  return {
    ok: true,
    status: FIXING_SOURCE.DIRECT,
    asOf: new Date(nowMs).toISOString(),
    asOfSource: opts.nowMs !== undefined ? 'caller-specified' : dataAsOf !== null ? 'newest quote in the data' : 'current time (no timestamps supplied)',
    wallClockLagHours: dataAsOf === null ? null : round(wallClockLagMs / 3.6e6, 2),
    currencies: published,
    participants: main,
    external: externalCodes.filter((e) => satellite[e]),
    satellite: Object.fromEntries(Object.entries(satellite).map(([k, v]) => [k, { price: v.price, quotesUsed: v.n, standardError: v.se }])),
    /** True when no external quote could have influenced the internal matrix. */
    internalMatrixIsVehicleFree: participantSet.size >= 2,
    orphans,
    provisional,
    shadowLogPrices: { ...p, ...Object.fromEntries(Object.entries(satellite).map(([k, v]) => [k, v.price])) },
    participantShadowLogPrices: p,
    shadowPriceSE: { ...seByCcy, ...Object.fromEntries(Object.entries(satellite).map(([k, v]) => [k, v.se])) },
    rate,
    conversionPath,
    /** Half-spread cost in bps of converting a into b along the cheapest path. */
    spreadBps: (a, b, opts) => conversionPath(a, b, opts).bps,
    matrix: matrixOut,
    diagnostics: {
      quotesSubmitted: (quotes || []).length,
      quotesAccepted: pass2.length,
      quotesRejected: rejected.length,
      outliers,
      weightedRMSEbps: Math.sqrt(sigma2) * 1e4,
      totalWeight: wUsed,
      dof,
      maxRawTriangleInconsistencyBps: round(maxRawTriangleBps, 3),
      worstTriangle,
      thinlyQuoted: thin,
      satellites: satelliteDiag,
      internalQuotesUsed: pass2.length,
      externalQuotesUsed: satelliteDiag.reduce((a, x) => a + (x.quotesUsed || 0), 0),
      residuals: pass2.map((o, i) => ({ pair: `${o.base}/${o.quote}`, observed: o.rate, fitted: Math.exp(fit.p[idx.get(o.base)] - fit.p[idx.get(o.quote)]), residualBps: round(resid[i] * 1e4, 3), weight: round(o.w, 5) })),
    },
    warnings,
  };
}

/**
 * §9 fallback hierarchy. Given a previous fixing and the current attempt,
 * decide what the published rate for a pair should be and label its provenance.
 */
export function resolvePair(fixing, base, quote, previousFixing = null, maxCarryHours = 24) {
  base = base.toUpperCase(); quote = quote.toUpperCase();
  if (base === quote) return { rate: 1, source: FIXING_SOURCE.DIRECT, note: 'identity' };
  if (fixing?.ok && fixing.shadowLogPrices[base] !== undefined && fixing.shadowLogPrices[quote] !== undefined) {
    const direct = fixing.diagnostics.residuals.some((r) => r.pair === `${base}/${quote}` || r.pair === `${quote}/${base}`);
    return { rate: fixing.rate(base, quote), source: direct ? FIXING_SOURCE.DIRECT : FIXING_SOURCE.SYNTHETIC };
  }
  if (previousFixing?.ok) {
    const ageH = (Date.now() - Date.parse(previousFixing.asOf)) / 3.6e6;
    if (ageH <= maxCarryHours && previousFixing.shadowLogPrices[base] !== undefined && previousFixing.shadowLogPrices[quote] !== undefined) {
      return { rate: previousFixing.rate(base, quote), source: FIXING_SOURCE.CARRIED, note: `carried forward ${ageH.toFixed(1)}h` };
    }
  }
  return { rate: NaN, source: FIXING_SOURCE.DISRUPTION, note: 'declare a market disruption event; apply the contractual disruption clause' };
}

/** Verify the published matrix is internally consistent (should be exact). */
export function verifyConsistency(fixing, tolBps = 1e-6) {
  if (!fixing?.ok) return { ok: false, reason: 'no fixing' };
  const cs = fixing.currencies;
  let maxTri = 0, maxRecip = 0;
  for (const a of cs) for (const b of cs) {
    if (a === b) continue;
    maxRecip = Math.max(maxRecip, Math.abs(Math.log(fixing.rate(a, b) * fixing.rate(b, a))) * 1e4);
    for (const c of cs) {
      if (c === a || c === b) continue;
      maxTri = Math.max(maxTri, Math.abs(Math.log((fixing.rate(a, b) * fixing.rate(b, c)) / fixing.rate(a, c))) * 1e4);
    }
  }
  return { ok: maxTri < tolBps && maxRecip < tolBps, maxTriangularErrorBps: maxTri, maxReciprocalErrorBps: maxRecip };
}
