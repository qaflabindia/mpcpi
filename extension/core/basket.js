/**
 * basket.js — §5, §6 and §7 of the BCC framework.
 *
 * BCC-T is a FIXED quantity vector. Quantities change only at a scheduled
 * reconstitution. Nothing in the diagnostics layer (BCC-D) may touch them —
 * that separation is the whole point of §4.
 */

import { num, clamp, sum, round } from './num.js';

/** §6 economic-weight formula. Weights of the formula itself, not of currencies. */
export const DEFAULT_ECONOMIC_WEIGHTS = {
  intraNetworkTradeShare: 0.40,
  gdpShare: 0.30,
  fxLiquidity: 0.15,
  convertibility: 0.15,
};

export const DEFAULT_BASKET_CONFIG = {
  economicWeights: DEFAULT_ECONOMIC_WEIGHTS,
  maximumWeight: 0.25,        // §6 concentration ceiling — a governance choice
  minimumWeight: 0.0,
  baseValue: 100,             // §5 BCC_T_Base
  reconstitutionMonths: 24,   // §6 "for example every two years"
};

/**
 * §6 EconomicScore. Inputs are shares/scores in [0,1]; anything outside is clamped
 * and reported, because silently rescaling an input would hide a data error.
 */
export function economicScores(currencies, cfg = DEFAULT_BASKET_CONFIG) {
  const w = { ...DEFAULT_ECONOMIC_WEIGHTS, ...(cfg.economicWeights || {}) };
  const issues = [];
  const scored = currencies.map((c) => {
    const get = (k) => {
      const v = num(c[k], NaN);
      if (!Number.isFinite(v)) { issues.push(`${c.code}: missing ${k}`); return 0; }
      if (v < 0 || v > 1) issues.push(`${c.code}: ${k}=${v} outside [0,1], clamped`);
      return clamp(v, 0, 1);
    };
    const parts = {
      intraNetworkTradeShare: get('intraNetworkTradeShare'),
      gdpShare: get('gdpShare'),
      fxLiquidity: get('fxLiquidity'),
      convertibility: get('convertibility'),
    };
    const score = w.intraNetworkTradeShare * parts.intraNetworkTradeShare
      + w.gdpShare * parts.gdpShare
      + w.fxLiquidity * parts.fxLiquidity
      + w.convertibility * parts.convertibility;
    return { code: String(c.code).toUpperCase(), name: c.name || c.code, parts, economicScore: score };
  });
  return { scored, issues };
}

/**
 * §6 cap-and-redistribute. Iterates because redistributing excess can push an
 * uncapped currency above the ceiling in turn. Converges in at most N rounds.
 */
export function applyCap(rawWeights, maximumWeight, minimumWeight = 0) {
  const codes = Object.keys(rawWeights);
  const n = codes.length;
  if (maximumWeight * n < 1 - 1e-12) {
    return { error: `cap ${maximumWeight} across ${n} currencies cannot sum to 1 (needs >= ${round(1 / n, 4)})` };
  }
  let w = { ...rawWeights };
  const capped = new Set();
  for (let iter = 0; iter < n + 2; iter++) {
    let excess = 0;
    for (const c of codes) if (w[c] > maximumWeight + 1e-15) { excess += w[c] - maximumWeight; w[c] = maximumWeight; capped.add(c); }
    if (excess <= 1e-15) break;
    const free = codes.filter((c) => !capped.has(c));
    const freeTotal = sum(free.map((c) => w[c]));
    if (!free.length || freeTotal <= 0) break;
    for (const c of free) w[c] += excess * (w[c] / freeTotal);
  }
  const floored = [];
  for (const c of codes) if (w[c] < minimumWeight) { floored.push(c); w[c] = minimumWeight; }
  const total = sum(codes.map((c) => w[c]));
  for (const c of codes) w[c] /= total;   // renormalise after any flooring
  return { weights: w, capped: [...capped], floored };
}

/**
 * Build a basket definition: weights -> FIXED quantities q_i, using the fixing
 * on the base date and an anchor currency. §5.
 *
 * q_i = baseValue * w_i / FX_i,anchor(base date)
 *
 * The anchor choice only sets the units of q; every subsequent value RATIO is
 * invariant to it, because later valuations use later shadow prices.
 */
export function buildBasket({ currencies, baseFixing, anchor, config = {}, asOf = null, note = '' }) {
  const cfg = { ...DEFAULT_BASKET_CONFIG, ...config };
  const { scored, issues } = economicScores(currencies, cfg);

  const totalScore = sum(scored.map((s) => s.economicScore));
  if (!(totalScore > 0)) return { error: 'all economic scores are zero — check the currencies sheet' };

  const raw = Object.fromEntries(scored.map((s) => [s.code, s.economicScore / totalScore]));
  const capRes = applyCap(raw, cfg.maximumWeight, cfg.minimumWeight);
  if (capRes.error) return { error: capRes.error };

  const anchorCode = String(anchor || scored[0].code).toUpperCase();
  if (!baseFixing?.ok) return { error: 'base-date fixing unavailable; a basket cannot be constituted without it' };

  const quantities = {};
  const missing = [];
  for (const s of scored) {
    const fx = baseFixing.rate(s.code, anchorCode);
    if (!Number.isFinite(fx) || fx <= 0) { missing.push(s.code); continue; }
    quantities[s.code] = (cfg.baseValue * capRes.weights[s.code]) / fx;
  }
  if (missing.length) return { error: `no base-date rate for ${missing.join(', ')} against anchor ${anchorCode}` };

  const baseDate = asOf || baseFixing.asOf || new Date().toISOString();
  const next = new Date(baseDate);
  next.setMonth(next.getMonth() + cfg.reconstitutionMonths);

  return {
    version: 1,
    note,
    anchor: anchorCode,
    baseDate,
    baseValue: cfg.baseValue,
    nextReconstitution: next.toISOString(),
    config: cfg,
    components: scored.map((s) => ({
      code: s.code,
      name: s.name,
      economicScore: round(s.economicScore, 8),
      rawWeight: round(raw[s.code], 8),
      finalWeight: round(capRes.weights[s.code], 8),
      quantity: quantities[s.code],
      baseRateVsAnchor: baseFixing.rate(s.code, anchorCode),
      capped: capRes.capped.includes(s.code),
    })),
    quantities,
    capped: capRes.capped,
    issues,
    /** Machine-checkable replication recipe — §5 "any participating bank should
     *  be able to reproduce the value independently". */
    replication: {
      formula: 'BCC_T_Value_K = SUM_i q_i * FX_iK',
      quantities: Object.fromEntries(Object.entries(quantities).map(([k, v]) => [k, round(v, 10)])),
    },
  };
}

/** §5 valuation. Returns the value of one BCC-T unit expressed in currency K. */
export function valueIn(basket, fixing, K) {
  K = String(K).toUpperCase();
  if (!basket || basket.error) return { error: basket?.error || 'no basket' };
  if (!fixing?.ok) return { error: 'no fixing' };
  const contributions = [];
  let total = 0;
  const missing = [];
  for (const [code, q] of Object.entries(basket.quantities)) {
    const fx = fixing.rate(code, K);
    if (!Number.isFinite(fx)) { missing.push(code); continue; }
    const c = q * fx;
    total += c;
    contributions.push({ code, quantity: q, rate: fx, contribution: c });
  }
  if (missing.length) return { error: `BCC-T cannot be valued in ${K}: no fixing for ${missing.join(', ')}`, missing };
  for (const c of contributions) c.share = c.contribution / total;
  return {
    numeraire: K,
    value: total,
    contributions: contributions.sort((a, b) => b.contribution - a.contribution),
    indexVsBase: total / (basket.baseValue * (fixing.rate(basket.anchor, K) / 1)) * 1,
  };
}

/**
 * §8 + §37 — the cross-rate table with BCC-T as the pivot.
 *
 * The bilateral matrix answers "how many INR per BRL". It does not say what the
 * quotation is ANCHORED to, and when a vehicle currency is in the estimator the
 * honest answer is "the dollar". With the internal matrix fitted from the
 * participating network alone, the natural pivot is the unit the network
 * actually defines: BCC-T.
 *
 *   V_K   = SUM_i q_i * FX_iK      units of K per BCC-T   (§5)
 *   1/V_K =                        BCC-T per unit of K
 *   FX_ij = V_j / V_i              every bilateral, derived from the pivot
 *
 * The last identity is worth stating: once every currency is quoted against
 * BCC-T, no bilateral needs a third currency to be discovered. That is what
 * §37's bridgeFX condition means operationally, and the derived bilaterals
 * reproduce the fitted ones exactly, so nothing is lost by re-anchoring.
 */
export function bcctQuotes(basket, fixing, opts = {}) {
  if (!basket || basket.error) return { error: basket?.error || 'no basket' };
  if (!fixing?.ok) return { error: 'no fixing' };

  const codes = opts.codes
    ? opts.codes.map((c) => String(c).toUpperCase())
    : fixing.currencies;

  const rows = [];
  for (const code of codes) {
    let v = 0;
    let ok = true;
    const legs = [];
    for (const [c, q] of Object.entries(basket.quantities)) {
      const r = fixing.rate(c, code);
      if (!Number.isFinite(r)) { ok = false; break; }
      v += q * r;
      legs.push({ component: c, quantity: q, rate: r, contribution: q * r });
    }
    if (!ok || !(v > 0)) { rows.push({ code, error: `cannot be valued against BCC-T from this fixing` }); continue; }
    const isParticipant = (fixing.participants || fixing.currencies).includes(code);
    rows.push({
      code,
      perBCCT: v,                      // units of `code` for one BCC-T
      inBCCT: 1 / v,                   // BCC-T for one unit of `code`
      role: isParticipant ? 'participant' : 'external (satellite)',
      basketWeight: basket.components.find((x) => x.code === code)?.finalWeight ?? null,
      shareOfBasketValue: isParticipant
        ? round((legs.find((l) => l.component === code)?.contribution ?? 0) / v, 6)
        : 0,
    });
  }

  const priced = rows.filter((r) => !r.error);
  const byCode = Object.fromEntries(priced.map((r) => [r.code, r.perBCCT]));

  /** Bilateral rate reconstructed from the pivot alone. */
  const derived = (i, j) => {
    i = String(i).toUpperCase(); j = String(j).toUpperCase();
    if (i === j) return 1;
    const vi = byCode[i], vj = byCode[j];
    return vi > 0 && vj > 0 ? vj / vi : NaN;
  };

  // The re-anchoring must be lossless. If it is not, something upstream is wrong
  // and the user should hear about it rather than see two disagreeing tables.
  let maxErrBps = 0, worst = null;
  for (const a of priced) for (const b of priced) {
    if (a.code === b.code) continue;
    const direct = fixing.rate(a.code, b.code);
    const viaPivot = derived(a.code, b.code);
    if (!Number.isFinite(direct) || !Number.isFinite(viaPivot)) continue;
    const e = Math.abs(Math.log(viaPivot / direct)) * 1e4;
    if (e > maxErrBps) { maxErrBps = e; worst = `${a.code}/${b.code}`; }
  }

  return {
    pivot: 'BCC-T',
    asOf: fixing.asOf,
    basketBaseDate: basket.baseDate,
    rows: priced.sort((a, b) => b.perBCCT - a.perBCCT),
    unpriced: rows.filter((r) => r.error),
    derived,
    reconstruction: {
      maxErrorBps: round(maxErrBps, 9),
      worstPair: worst,
      lossless: maxErrBps < 1e-6,
      note: 'Every bilateral rate is V_j / V_i. No third currency is consulted to discover any pair (§37 bridgeFX).',
    },
  };
}

/**
 * Drift of realised weights away from the fixed constitution weights. This is
 * the honest disclosure that a fixed-quantity basket re-weights itself as rates
 * move; it is a reason to reconstitute on schedule, not a reason to re-weight
 * continuously.
 */
export function weightDrift(basket, fixing, numeraire = null) {
  const K = numeraire || basket.anchor;
  const v = valueIn(basket, fixing, K);
  if (v.error) return v;
  const rows = v.contributions.map((c) => {
    const target = basket.components.find((x) => x.code === c.code)?.finalWeight ?? NaN;
    return { code: c.code, targetWeight: target, realisedWeight: c.share, driftPp: (c.share - target) * 100 };
  });
  return { numeraire: K, rows, maxAbsDriftPp: Math.max(...rows.map((r) => Math.abs(r.driftPp))) };
}

/**
 * §7 own-currency-EXCLUDED effective strength index.
 *
 *   FX_Strength_i(t) = 100 * exp( SUM_{j != i} w_ij * ln( FX_ij(t) / FX_ij(0) ) )
 *
 * Weights over the OTHER currencies only, renormalised to sum to 1. A rise means
 * currency i has appreciated against the rest of the network.
 */
export function strengthIndex(basket, baseFixing, currentFixing, opts = {}) {
  if (!baseFixing?.ok || !currentFixing?.ok) return { error: 'both a base and a current fixing are required' };
  const codes = basket ? basket.components.map((c) => c.code) : currentFixing.currencies;
  const baseWeights = basket
    ? Object.fromEntries(basket.components.map((c) => [c.code, c.finalWeight]))
    : Object.fromEntries(codes.map((c) => [c, 1 / codes.length]));

  const out = [];
  for (const i of codes) {
    const others = codes.filter((j) => j !== i);
    const wsum = sum(others.map((j) => baseWeights[j] ?? 0));
    if (!(wsum > 0)) { out.push({ code: i, error: 'no partner weights' }); continue; }
    let acc = 0;
    let ok = true;
    const legs = [];
    for (const j of others) {
      const w = (baseWeights[j] ?? 0) / wsum;
      const now = currentFixing.rate(i, j), base = baseFixing.rate(i, j);
      if (!Number.isFinite(now) || !Number.isFinite(base) || now <= 0 || base <= 0) { ok = false; break; }
      const leg = w * Math.log(now / base);
      acc += leg;
      legs.push({ vs: j, weight: w, logChange: Math.log(now / base), contribution: leg });
    }
    if (!ok) { out.push({ code: i, error: 'missing partner rate' }); continue; }
    out.push({
      code: i,
      index: 100 * Math.exp(acc),
      logChange: acc,
      changePct: (Math.exp(acc) - 1) * 100,
      excludesOwnCurrency: true,
      legs: legs.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
    });
  }
  return {
    base: baseFixing.asOf,
    current: currentFixing.asOf,
    note: 'Own-currency-excluded (§7). A common basket containing currency i cannot independently measure i.',
    rows: out.sort((a, b) => (b.index ?? 0) - (a.index ?? 0)),
  };
}

/**
 * Attenuation demonstration for §7: how much of an idiosyncratic shock to
 * currency i is mechanically absorbed when i is measured against a basket that
 * CONTAINS i at weight w_i. Included because the panel asserts the point and
 * should be able to show the arithmetic.
 */
export function selfReferenceAttenuation(weight) {
  const w = clamp(num(weight, 0), 0, 1);
  return {
    weightInBasket: w,
    measuredFractionOfShock: 1 - w,
    attenuationPct: w * 100,
    explanation: `A shock of x to this currency measured against a basket in which it holds ${(w * 100).toFixed(1)}% weight registers as ${((1 - w) * 100).toFixed(1)}% of x, because the basket moves with it.`,
  };
}
