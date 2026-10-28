/**
 * fiscal-backing.js — debt-adjusted currency value. BCC-D, alongside §12.
 *
 * The question: how much purchasing power would a currency lose if its
 * government closed its fiscal gap by inflation rather than by taxing or
 * spending less? The same rule is applied to every currency, the dollar
 * included. A rule that is applied only to the dollar is an opinion, not a
 * measurement.
 *
 *   debt dynamics           d' = d·(1 + r)/(1 + g) − pb
 *   stabilising balance     pb* = d·(r − g)/(1 + g)
 *   fiscal gap              gap = pb* − pb                    share of GDP per year
 *   inflatable debt         d_L = d·(1 − fxDebtShare)         FX debt cannot be inflated away
 *   debasement pressure     π_x = gap / (d_L − gap)           extra inflation per year, gap > 0
 *   value after H years     V_H = (1 + π_x)^(−H)              per unit of today's purchasing power
 *   relative adjustment     FX*_ij = FX_ij · ((1 + π_x,j)/(1 + π_x,i))^H
 *
 * π_x solves d_L·π/(1 + π) = gap: the real erosion of own-currency debt by one
 * year of surprise inflation equals the shortfall. It is an UPPER BOUND on the
 * monetary channel, not a forecast. It assumes the whole gap is monetised,
 * that the inflation is unanticipated, and that the debt does not reprice
 * within the year. Short average maturity weakens the last assumption, and
 * the result is then an understatement of the inflation needed.
 *
 * Hard rule from §4: nothing here feeds basket.js. A debt-adjusted value is a
 * diagnostic. Settling a contract at a rate other than the market rate needs
 * someone to pay the difference, and that is how the transferable rouble
 * failed (§3).
 */

import { num, isNum, round } from './num.js';

export const DEFAULT_HORIZON_YEARS = 10;

/** One economy. Inputs are ratios: 120% of GDP is 1.20, a 2.8% deficit is −0.028. */
export function fiscalBacking(obs, horizonYears = DEFAULT_HORIZON_YEARS) {
  const d = num(obs?.debtGdp);
  const pb = num(obs?.primaryBalance);
  const r = num(obs?.effectiveRate);
  const g = num(obs?.nominalGrowth);
  const fx = isNum(num(obs?.fxDebtShare)) ? num(obs.fxDebtShare) : 0;
  const H = num(horizonYears);

  const missing = [['debtGdp', d], ['primaryBalance', pb], ['effectiveRate', r], ['nominalGrowth', g]]
    .filter(([, v]) => !isNum(v)).map(([k]) => k);
  if (missing.length) return { error: `missing ${missing.join(', ')}`, missing };
  if (d <= 0) return { error: 'debtGdp must be positive' };
  if (g <= -1) return { error: 'nominalGrowth must exceed −100%' };

  const stabilising = (d * (r - g)) / (1 + g);
  const gap = stabilising - pb;
  const inflatable = d * (1 - fx);

  let pressure, channel;
  if (gap <= 0) {
    pressure = 0;
    channel = 'none: the primary balance already stabilises the debt ratio';
  } else if (inflatable <= gap) {
    pressure = null;
    channel = 'not closable by inflation: own-currency debt is too small relative to the gap, so the residual risk is default or restructuring';
  } else {
    pressure = gap / (inflatable - gap);
    channel = 'inflation';
  }

  const valueAfterH = pressure === null ? null : Math.pow(1 + pressure, -H);
  return {
    inputs: { debtGdp: d, primaryBalance: pb, effectiveRate: r, nominalGrowth: g, fxDebtShare: fx, horizonYears: H },
    rMinusG: round(r - g, 6),
    stabilisingPrimaryBalance: round(stabilising, 6),
    fiscalGap: round(gap, 6),
    inflatableDebt: round(inflatable, 6),
    debasementPressure: pressure === null ? null : round(pressure, 6),
    valueAfterHorizon: valueAfterH === null ? null : round(valueAfterH, 6),
    cumulativeDebasement: valueAfterH === null ? null : round(1 - valueAfterH, 6),
    channel,
  };
}

/**
 * Every economy on the same rule, ranked from most to least pressure. Rows
 * that cannot be computed are kept and say why, so a missing country is never
 * mistaken for a healthy one.
 */
export function fiscalBackingTable(rows, horizonYears = DEFAULT_HORIZON_YEARS) {
  const out = (rows || []).map((row) => ({
    participant: String(row.participant ?? '').toUpperCase(),
    currency: row.currency ? String(row.currency).toUpperCase() : null,
    ...fiscalBacking(row, horizonYears),
  }));
  const rank = (x) => (x.error ? -Infinity : x.debasementPressure === null ? Infinity : x.debasementPressure);
  return out.sort((a, b) => rank(b) - rank(a));
}

/**
 * Rate adjustment for a pair: what FX_ij (units of j per unit of i) becomes if
 * both currencies lose value at their own debasement pressure for H years.
 * A ratio above 1 means i holds value better than j on fiscal grounds.
 */
export function relativeAdjustment(fbI, fbJ, horizonYears = DEFAULT_HORIZON_YEARS) {
  const pi = fbI?.debasementPressure, pj = fbJ?.debasementPressure;
  if (!isNum(pi) || !isNum(pj)) return { error: 'both currencies need a finite debasement pressure' };
  const H = num(horizonYears);
  const factor = Math.pow((1 + pj) / (1 + pi), H);
  return { factor: round(factor, 6), changePct: round((factor - 1) * 100, 4), horizonYears: H };
}
