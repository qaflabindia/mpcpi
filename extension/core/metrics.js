/**
 * metrics.js — the leading / lagging separation.
 *
 * The paper distinguishes daily market indicators from slow structural
 * diagnostics (§15) but does not formalise how they combine. This module makes
 * that convention explicit and auditable:
 *
 *   LEADING  — forward-looking, high frequency, revised rarely, published fast.
 *              Market prices and positioning. They move BEFORE the outcome.
 *   LAGGING  — realised, low frequency, heavily revised, published slowly.
 *              National accounts and realised system performance. They CONFIRM.
 *
 *   w_L(T) = exp(-T / tau)          horizon weight on the leading block
 *   Composite = w_L * Leading + (1 - w_L) * Lagging
 *
 * A one-day settlement is dominated by market signal; a one-year exposure is
 * dominated by structural fundamentals. tau (default 90 days) is the horizon at
 * which the leading block still carries 1/e of the weight.
 *
 * Divergence = Leading - Lagging is reported separately as an early-warning
 * statistic: fundamentals that still look fine while markets have already moved.
 *
 * Every indicator is scored to a 0-100 scale on a FIXED reference distribution
 * (§11), never cross-sectional min-max, so a score is comparable across years.
 */

import { num, clamp, mean, sd, winsorize, ewmaVol, round, isNum } from './num.js';

export const DIRECTION = { HIGHER_IS_BETTER: 1, HIGHER_IS_WORSE: -1 };

/**
 * Indicator registry. `ref` holds the FIXED calibration constants of §11:
 * {mean, sd, lo, hi} where lo/hi are winsorisation thresholds. These are
 * deliberately editable by the user in the Reference tab, but they must be set
 * ONCE from a calibration sample and then left alone.
 */
export const INDICATORS = {
  // ─────────────── LEADING (market, high frequency) ───────────────
  fxVol20d:        { block: 'leading', label: 'FX volatility, 20d EWMA (ann.)', dir: -1, ref: { mean: 0.10, sd: 0.05, lo: 0.005, hi: 0.60 }, unit: 'ratio' },
  fxCarry:         { block: 'leading', label: 'Policy-rate differential vs network', dir: -1, ref: { mean: 0.02, sd: 0.03, lo: -0.10, hi: 0.25 }, unit: 'ratio' },
  cds5y:           { block: 'leading', label: 'Sovereign CDS 5y', dir: -1, ref: { mean: 120, sd: 90, lo: 5, hi: 900 }, unit: 'bps' },
  yieldSpread:     { block: 'leading', label: 'Sovereign spread vs network median', dir: -1, ref: { mean: 150, sd: 120, lo: -100, hi: 1200 }, unit: 'bps' },
  bidAskBps:       { block: 'leading', label: 'FX bid-ask spread', dir: -1, ref: { mean: 8, sd: 6, lo: 0.2, hi: 80 }, unit: 'bps' },
  marketDepth:     { block: 'leading', label: 'Top-of-book depth', dir: 1, ref: { mean: 5e5, sd: 4e5, lo: 1e4, hi: 5e6 }, unit: 'notional' },
  quoteCount:      { block: 'leading', label: 'Independent qualifying quotes', dir: 1, ref: { mean: 6, sd: 4, lo: 0, hi: 40 }, unit: 'count' },
  reserveTrend3m:  { block: 'leading', label: 'FX reserves, 3m change', dir: 1, ref: { mean: 0.0, sd: 0.04, lo: -0.30, hi: 0.30 }, unit: 'ratio' },
  termsOfTrade3m:  { block: 'leading', label: 'Terms-of-trade momentum, 3m', dir: 1, ref: { mean: 0.0, sd: 0.05, lo: -0.30, hi: 0.30 }, unit: 'ratio' },
  inflationSurprise:{ block: 'leading', label: 'Inflation surprise vs consensus', dir: -1, ref: { mean: 0.0, sd: 0.01, lo: -0.05, hi: 0.08 }, unit: 'ratio' },
  netPositionDrift:{ block: 'leading', label: 'Clearing net-position drift', dir: -1, ref: { mean: 0.0, sd: 0.15, lo: -1, hi: 1 }, unit: 'ratio' },
  fwdPointsBps:    { block: 'leading', label: 'Forward points, settlement tenor', dir: -1, ref: { mean: 50, sd: 120, lo: -400, hi: 900 }, unit: 'bps' },

  // ─────────────── LAGGING (structural, low frequency) ───────────────
  inflationYoY:    { block: 'lagging', label: 'CPI inflation, y/y', dir: -1, ref: { mean: 0.045, sd: 0.035, lo: -0.02, hi: 0.40 }, unit: 'ratio' },
  inflationVol5y:  { block: 'lagging', label: 'Inflation volatility, 5y', dir: -1, ref: { mean: 0.025, sd: 0.02, lo: 0.001, hi: 0.20 }, unit: 'ratio' },
  debtGdp:         { block: 'lagging', label: 'Government debt / GDP', dir: -1, ref: { mean: 0.60, sd: 0.30, lo: 0.05, hi: 2.50 }, unit: 'ratio' },
  interestRevenue: { block: 'lagging', label: 'Interest expenditure / revenue', dir: -1, ref: { mean: 0.10, sd: 0.07, lo: 0.0, hi: 0.60 }, unit: 'ratio' },
  primaryBalance:  { block: 'lagging', label: 'Primary fiscal balance / GDP', dir: 1, ref: { mean: -0.01, sd: 0.03, lo: -0.15, hi: 0.10 }, unit: 'ratio' },
  fxDebtShare:     { block: 'lagging', label: 'FX share of sovereign debt', dir: -1, ref: { mean: 0.20, sd: 0.20, lo: 0.0, hi: 1.0 }, unit: 'ratio' },
  avgMaturityYrs:  { block: 'lagging', label: 'Average debt maturity', dir: 1, ref: { mean: 7.0, sd: 3.0, lo: 0.5, hi: 25 }, unit: 'years' },
  refinancingNeed: { block: 'lagging', label: 'Near-term refinancing / revenue', dir: -1, ref: { mean: 0.15, sd: 0.12, lo: 0.0, hi: 1.2 }, unit: 'ratio' },
  reserveMonths:   { block: 'lagging', label: 'Reserve cover, months of imports', dir: 1, ref: { mean: 6.0, sd: 3.5, lo: 0.2, hi: 30 }, unit: 'months' },
  stExternalDebt:  { block: 'lagging', label: 'Short-term external debt / reserves', dir: -1, ref: { mean: 0.50, sd: 0.40, lo: 0.0, hi: 3.0 }, unit: 'ratio' },
  currentAccount:  { block: 'lagging', label: 'Current account / GDP', dir: 1, ref: { mean: 0.0, sd: 0.04, lo: -0.15, hi: 0.15 }, unit: 'ratio' },
  niipGdp:         { block: 'lagging', label: 'NIIP / GDP', dir: 1, ref: { mean: -0.10, sd: 0.40, lo: -1.5, hi: 1.5 }, unit: 'ratio' },
  bankCapital:     { block: 'lagging', label: 'Bank capital adequacy ratio', dir: 1, ref: { mean: 0.16, sd: 0.04, lo: 0.06, hi: 0.30 }, unit: 'ratio' },
  privateCreditGap:{ block: 'lagging', label: 'Credit-to-GDP gap', dir: -1, ref: { mean: 0.0, sd: 0.08, lo: -0.30, hi: 0.40 }, unit: 'ratio' },
  cbIndependence:  { block: 'lagging', label: 'Central-bank independence index', dir: 1, ref: { mean: 0.60, sd: 0.18, lo: 0.0, hi: 1.0 }, unit: 'index' },
  settlementFails: { block: 'lagging', label: 'Realised settlement fail rate', dir: -1, ref: { mean: 0.005, sd: 0.006, lo: 0, hi: 0.08 }, unit: 'ratio' },
  realisedNetting: { block: 'lagging', label: 'Realised netting efficiency', dir: 1, ref: { mean: 0.55, sd: 0.18, lo: 0, hi: 0.98 }, unit: 'ratio' },
};

export const LEADING_KEYS = Object.keys(INDICATORS).filter((k) => INDICATORS[k].block === 'leading');
export const LAGGING_KEYS = Object.keys(INDICATORS).filter((k) => INDICATORS[k].block === 'lagging');

/**
 * §11 fixed-reference scoring:
 *   x_w = winsorize(x, lo, hi);  z = (x_w - mean_ref)/sd_ref
 *   score = clamp(50 + dir * 10 * z, 0, 100)
 *
 * Note the paper's 10*z scaling: one reference SD moves the score 10 points, so
 * a 5-sigma outlier saturates. That is intentional — it keeps 2027 and 2035
 * comparable instead of rescaling the world every year.
 */
export function scoreIndicator(key, value, refOverride = null) {
  const spec = INDICATORS[key];
  if (!spec) return { key, error: `unknown indicator '${key}'` };
  const ref = { ...spec.ref, ...(refOverride || {}) };
  const raw = num(value, NaN);
  if (!isNum(raw)) return { key, label: spec.label, block: spec.block, value: null, score: null, missing: true };
  const w = winsorize(raw, ref.lo, ref.hi);
  const z = ref.sd > 0 ? (w - ref.mean) / ref.sd : 0;
  return {
    key, label: spec.label, block: spec.block, unit: spec.unit,
    value: raw,
    winsorized: w !== raw ? w : null,
    z: round(z, 6),
    direction: spec.dir,
    score: round(clamp(50 + spec.dir * 10 * z, 0, 100), 4),
    missing: false,
  };
}

/**
 * Score a whole observation. Returns block indices with an explicit coverage
 * flag — §15: "the system should not silently impute a favorable score".
 */
export function scoreObservation(obs, refOverrides = {}, weights = {}) {
  const rows = [];
  for (const key of Object.keys(INDICATORS)) {
    rows.push(scoreIndicator(key, obs?.[key], refOverrides[key]));
  }
  const blockIndex = (block) => {
    const present = rows.filter((r) => r.block === block && !r.missing && r.score !== null);
    const all = rows.filter((r) => r.block === block);
    if (!present.length) return { index: null, coverage: 0, n: 0, of: all.length, confidence: 'none' };
    const wsum = present.reduce((s, r) => s + (weights[r.key] ?? 1), 0);
    const idx = present.reduce((s, r) => s + r.score * (weights[r.key] ?? 1), 0) / wsum;
    const coverage = present.length / all.length;
    return {
      index: round(idx, 4),
      coverage: round(coverage, 4),
      n: present.length, of: all.length,
      confidence: coverage >= 0.75 ? 'high' : coverage >= 0.5 ? 'medium' : 'low',
      missing: rows.filter((r) => r.block === block && r.missing).map((r) => r.key),
    };
  };
  return { rows, leading: blockIndex('leading'), lagging: blockIndex('lagging') };
}

/** w_L(T) = exp(-T/tau). */
export const leadingWeight = (horizonDays, tauDays = 90) =>
  clamp(Math.exp(-Math.max(0, num(horizonDays, 0)) / Math.max(1e-6, tauDays)), 0, 1);

/**
 * Horizon-weighted composite plus the divergence early-warning statistic.
 * If one block is entirely missing the composite falls back to the other and
 * says so, rather than pretending to a blend it cannot compute.
 */
export function composite(scored, horizonDays, tauDays = 90) {
  const L = scored.leading.index, G = scored.lagging.index;
  const wL = leadingWeight(horizonDays, tauDays);
  let index, basis;
  if (L === null && G === null) return { index: null, basis: 'none', error: 'no scoreable indicators' };
  if (L === null) { index = G; basis = 'lagging-only'; }
  else if (G === null) { index = L; basis = 'leading-only'; }
  else { index = wL * L + (1 - wL) * G; basis = 'blended'; }

  const divergence = (L !== null && G !== null) ? L - G : null;
  return {
    index: round(index, 4),
    basis,
    horizonDays,
    tauDays,
    leadingWeight: round(wL, 6),
    laggingWeight: round(1 - wL, 6),
    leading: L, lagging: G,
    divergence: divergence === null ? null : round(divergence, 4),
    signal: divergence === null ? 'insufficient-data'
      : divergence < -12 ? 'deteriorating-ahead-of-fundamentals'
      : divergence > 12 ? 'markets-ahead-of-fundamentals-positive'
      : 'aligned',
    confidence: scored.leading.confidence === 'high' && scored.lagging.confidence === 'high' ? 'high'
      : (scored.leading.confidence === 'none' || scored.lagging.confidence === 'none') ? 'low' : 'medium',
    note: divergence !== null && divergence < -12
      ? 'Market indicators have deteriorated while realised fundamentals have not yet. Structural data lag; treat the leading block as the live signal for short settlement horizons.'
      : null,
  };
}

/** Realised FX volatility for a pair, from a fixing time series. */
export function pairVolatility(series, base, quote, lambda = 0.94) {
  const rets = [];
  for (let i = 1; i < series.length; i++) {
    const a = series[i - 1]?.rate?.(base, quote), b = series[i]?.rate?.(base, quote);
    if (Number.isFinite(a) && Number.isFinite(b) && a > 0 && b > 0) rets.push(Math.log(b / a));
  }
  return { n: rets.length, annualisedVol: ewmaVol(rets, lambda), returns: rets };
}

/** Cross volatility from single-currency vols and correlation. */
export const crossVol = (volI, volJ, rho = 0) =>
  Math.sqrt(Math.max(0, volI * volI + volJ * volJ - 2 * rho * volI * volJ));

export function describeIndicator(key) {
  const s = INDICATORS[key];
  return s ? { key, ...s, blockMeaning: s.block === 'leading' ? 'moves before the outcome' : 'confirms after the outcome' } : null;
}
