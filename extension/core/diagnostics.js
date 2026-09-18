/**
 * diagnostics.js — BCC-D. §10 to §17.
 *
 * Hard rule from §4: nothing computed here may feed back into basket.js.
 * The diagnostics inform collateral haircuts, credit bands and research. They
 * never alter the contractual ruler.
 */

import { num, clamp, mean, sd, round, ols, isNum } from './num.js';
import { scoreIndicator, scoreObservation, INDICATORS } from './metrics.js';

/** §10 — four dimensions, no variable appearing twice. */
export const CHS_BLOCKS = {
  priceStability: {
    weight: 0.25,
    indicators: { inflationYoY: 0.55, inflationVol5y: 0.30, inflationSurprise: 0.15 },
  },
  fiscalSustainability: {
    weight: 0.30,
    // §12 — ratios, not nominal debt. Own-currency debt is not the same risk as FX debt.
    indicators: { debtGdp: 0.22, interestRevenue: 0.25, primaryBalance: 0.18, fxDebtShare: 0.15, refinancingNeed: 0.12, avgMaturityYrs: 0.08 },
  },
  externalResilience: {
    weight: 0.30,
    // §13 — reserve adequacy lives HERE and nowhere else; likewise NIIP.
    indicators: { reserveMonths: 0.30, stExternalDebt: 0.30, currentAccount: 0.20, niipGdp: 0.20 },
  },
  monetaryFinancialResilience: {
    weight: 0.15,
    indicators: { bankCapital: 0.35, privateCreditGap: 0.30, cbIndependence: 0.35 },
  },
};

/** §14 — international USAGE, not health. Deliberately disjoint from CHS. */
export const CPS_COMPONENTS = {
  reserveUsage:          { weight: 0.25, label: 'Share of allocated global reserves' },
  tradeInvoicing:        { weight: 0.25, label: 'Share of world trade invoiced' },
  fxTurnover:            { weight: 0.20, label: 'Share of global FX turnover' },
  internationalDebt:     { weight: 0.15, label: 'Share of international debt securities' },
  crossBorderSettlement: { weight: 0.15, label: 'Share of cross-border settlement messages' },
};

/**
 * CPS inputs are global SHARES in [0,1]. A share is scored on a fixed
 * logarithmic reference rather than a linear one, because international usage
 * is extremely right-skewed: the difference between 0.1% and 1% matters as much
 * as the difference between 10% and 100%.
 */
const CPS_LOG_REF = { floor: 1e-4, mean: Math.log(0.02), sd: 1.6 };

export function scoreShare(share, ref = CPS_LOG_REF) {
  const s = num(share, NaN);
  if (!isNum(s) || s < 0) return null;
  const z = (Math.log(Math.max(s, ref.floor)) - ref.mean) / ref.sd;
  return round(clamp(50 + 10 * z, 0, 100), 4);
}

/** §10 Currency Health Score. */
export function currencyHealth(obs, refOverrides = {}) {
  const blocks = {};
  for (const [bname, bspec] of Object.entries(CHS_BLOCKS)) {
    const rows = [];
    let wsum = 0, acc = 0;
    for (const [key, w] of Object.entries(bspec.indicators)) {
      const r = scoreIndicator(key, obs?.[key], refOverrides[key]);
      rows.push(r);
      if (!r.missing && r.score !== null) { acc += r.score * w; wsum += w; }
    }
    const declaredW = Object.values(bspec.indicators).reduce((a, b) => a + b, 0);
    blocks[bname] = {
      weight: bspec.weight,
      score: wsum > 0 ? round(acc / wsum, 4) : null,
      coverage: round(wsum / declaredW, 4),
      n: rows.filter((r) => !r.missing).length,
      of: rows.length,
      missing: rows.filter((r) => r.missing).map((r) => r.key),
      rows,
    };
  }
  let wsum = 0, acc = 0;
  for (const [bname, b] of Object.entries(blocks)) if (b.score !== null) { acc += b.score * b.weight; wsum += b.weight; }
  const coverage = wsum;                      // fraction of declared block weight actually present
  const chs = wsum > 0 ? acc / wsum : null;
  return {
    chs: chs === null ? null : round(chs, 4),
    blocks,
    coverage: round(coverage, 4),
    confidence: coverage >= 0.85 ? 'high' : coverage >= 0.6 ? 'medium' : coverage > 0 ? 'low' : 'none',
    formula: 'CHS = 0.25*PriceStability + 0.30*FiscalSustainability + 0.30*ExternalResilience + 0.15*MonetaryFinancialResilience',
    note: 'International usage is deliberately excluded (§10). Health and internationalisation are separate phenomena.',
    warning: coverage < 0.6 ? 'Reported on reduced coverage. Missing inputs are NOT imputed favourably (§15).' : null,
  };
}

/** §12 standalone fiscal view, expressed as risk rather than score. */
export function fiscalSustainability(obs, refOverrides = {}) {
  const b = currencyHealth(obs, refOverrides).blocks.fiscalSustainability;
  return {
    fiscalSustainability: b.score,
    fiscalRisk: b.score === null ? null : round(100 - b.score, 4),
    coverage: b.coverage,
    drivers: b.rows.filter((r) => !r.missing).map((r) => ({ key: r.key, label: r.label, value: r.value, score: r.score, contribution: r.score - 50 }))
      .sort((a, b2) => a.contribution - b2.contribution),
    note: 'FX-denominated debt is scored separately from total debt because it adds a currency mismatch the sovereign cannot inflate away (§12).',
  };
}

/** §14 Currency Power Score. */
export function currencyPower(usage) {
  const rows = [];
  let wsum = 0, acc = 0;
  for (const [key, spec] of Object.entries(CPS_COMPONENTS)) {
    const share = num(usage?.[key], NaN);
    const score = scoreShare(share);
    rows.push({ key, label: spec.label, weight: spec.weight, share: isNum(share) ? share : null, score, missing: score === null });
    if (score !== null) { acc += score * spec.weight; wsum += spec.weight; }
  }
  return {
    cps: wsum > 0 ? round(acc / wsum, 4) : null,
    coverage: round(wsum, 4),
    rows,
    frequency: 'annual research statistic (§15) — not a daily index',
    confidence: wsum >= 0.85 ? 'high' : wsum >= 0.6 ? 'medium' : wsum > 0 ? 'low' : 'none',
  };
}

/**
 * §16 — excess international usage.
 *
 *   CPS_it = a + b*CHS_it + c*MarketDepth_it + d*TradeScale_it + tau_t + e_it
 *
 * ExcessUsage = e_it, published WITH standard errors. Optional currency fixed
 * effects (mu_i) separate a persistent structural advantage from a temporary
 * deviation. Subtracting CPS from CHS, which the paper explicitly rejects, is
 * not offered anywhere in this codebase.
 *
 * @param {Array} panel [{currency, year, cps, chs, marketDepth, tradeScale}]
 */
export function excessUsage(panel, opts = {}) {
  const { currencyFixedEffects = false, yearEffects = true } = opts;
  const rows = (panel || []).filter((r) =>
    isNum(num(r.cps, NaN)) && isNum(num(r.chs, NaN)) && isNum(num(r.marketDepth, NaN)) && isNum(num(r.tradeScale, NaN)));
  if (rows.length < 6) return { error: `need at least 6 complete currency-year observations; have ${rows.length}`, usable: rows.length };

  const years = [...new Set(rows.map((r) => String(r.year)))].sort();
  const ccys = [...new Set(rows.map((r) => String(r.currency).toUpperCase()))].sort();

  const names = ['const', 'CHS', 'MarketDepth', 'TradeScale'];
  const dropYear = years[0], dropCcy = ccys[0];
  const useYears = yearEffects && years.length > 1 ? years.slice(1) : [];
  const useCcys = currencyFixedEffects && ccys.length > 1 ? ccys.slice(1) : [];
  for (const y of useYears) names.push(`year_${y}`);
  for (const c of useCcys) names.push(`ccy_${c}`);

  const X = rows.map((r) => {
    const row = [1, num(r.chs), num(r.marketDepth), num(r.tradeScale)];
    for (const y of useYears) row.push(String(r.year) === y ? 1 : 0);
    for (const c of useCcys) row.push(String(r.currency).toUpperCase() === c ? 1 : 0);
    return row;
  });
  const y = rows.map((r) => num(r.cps));

  const fit = ols(X, y, names);
  if (!fit || fit.error) return { error: fit?.error || 'regression failed', usable: rows.length };

  const resid = rows.map((r, i) => ({
    currency: String(r.currency).toUpperCase(),
    year: r.year,
    cps: y[i],
    predicted: round(fit.fitted[i], 4),
    excessUsage: round(fit.residuals[i], 4),
    tStat: fit.sigma > 0 ? round(fit.residuals[i] / fit.sigma, 3) : null,
    ci95: [round(fit.residuals[i] - 1.959964 * fit.sigma, 3), round(fit.residuals[i] + 1.959964 * fit.sigma, 3)],
    significant: fit.sigma > 0 ? Math.abs(fit.residuals[i] / fit.sigma) > 1.959964 : null,
  }));

  const byCcy = {};
  for (const r of resid) (byCcy[r.currency] ||= []).push(r.excessUsage);
  const persistent = Object.entries(byCcy).map(([c, vals]) => {
    const m = mean(vals);
    const s = vals.length > 1 ? sd(vals) : NaN;
    const seMean = Number.isFinite(s) ? s / Math.sqrt(vals.length) : NaN;
    return {
      currency: c, n: vals.length,
      meanExcessUsage: round(m, 4),
      se: round(seMean, 4),
      t: Number.isFinite(seMean) && seMean > 0 ? round(m / seMean, 3) : null,
      significant: Number.isFinite(seMean) && seMean > 0 ? Math.abs(m / seMean) > 1.959964 : null,
    };
  }).sort((a, b) => b.meanExcessUsage - a.meanExcessUsage);

  return {
    specification: currencyFixedEffects ? 'CPS ~ CHS + MarketDepth + TradeScale + year FE + currency FE' : 'CPS ~ CHS + MarketDepth + TradeScale + year FE',
    droppedBaseline: { year: yearEffects ? dropYear : null, currency: currencyFixedEffects ? dropCcy : null },
    n: fit.n, df: fit.df, r2: round(fit.r2, 5), adjR2: round(fit.adjR2, 5), residualSD: round(fit.sigma, 4),
    coefficients: fit.coefficients.filter((c) => !c.name.startsWith('year_') && !c.name.startsWith('ccy_'))
      .map((c) => ({ ...c, beta: round(c.beta, 5), se: round(c.se, 5), t: round(c.t, 3), p: round(c.p, 5), ci95: c.ci95.map((v) => round(v, 5)) })),
    fixedEffects: fit.coefficients.filter((c) => c.name.startsWith('year_') || c.name.startsWith('ccy_'))
      .map((c) => ({ name: c.name, beta: round(c.beta, 4), se: round(c.se, 4), p: round(c.p, 4) })),
    observations: resid.sort((a, b) => b.excessUsage - a.excessUsage),
    persistentByCurrency: persistent,
    interpretation: 'A positive residual means international usage EXCEEDS what fundamentals and market structure predict. It is an estimate with a standard error, not an assertion of unearned privilege (§36).',
    caveat: 'Deep markets, legal predictability and settlement reliability are real economic services. A significant residual is a measurement, and its cause remains an open question.',
  };
}

/**
 * §36 decomposition of observed currency power into the four named components.
 * Uses a fitted excessUsage model so the split is estimated, not asserted.
 */
export function decomposePower(model, currency, year = null) {
  if (model?.error) return model;
  const obs = model.observations.filter((o) => o.currency === currency.toUpperCase() && (year === null || String(o.year) === String(year)));
  if (!obs.length) return { error: `no observation for ${currency}${year ? ' ' + year : ''}` };
  const o = obs[obs.length - 1];
  const coef = Object.fromEntries(model.coefficients.map((c) => [c.name, c.beta]));
  const persistent = model.persistentByCurrency.find((p) => p.currency === currency.toUpperCase());
  return {
    currency: currency.toUpperCase(), year: o.year,
    observedCurrencyPower: o.cps,
    components: {
      fundamental: round(coef.CHS ?? 0, 5),
      marketInfrastructure: round(coef.MarketDepth ?? 0, 5),
      networkPersistent: persistent ? persistent.meanExcessUsage : null,
      residualTransitory: round(o.excessUsage - (persistent?.meanExcessUsage ?? 0), 4),
    },
    identity: 'ObservedCurrencyPower = Fundamental + MarketInfrastructure + Network + Residual (§36)',
    note: 'The fundamental and infrastructure entries are marginal effects per unit of the regressor, not levels. Read them with the coefficient table.',
  };
}

/** §37 — the operational definition of the whole exercise. */
export function mandatoryDollarDependency(flags) {
  const dims = [
    ['measurement', 'A currency pair can be MEASURED without a USD leg'],
    ['invoicing', 'A contract can be INVOICED without USD'],
    ['bridgeFx', 'Conversion runs without a USD BRIDGE'],
    ['clearing', 'Obligations CLEAR without a USD system'],
    ['settlement', 'Final SETTLEMENT occurs without USD'],
  ];
  const rows = dims.map(([k, label]) => {
    const independent = Boolean(flags?.[k]);
    return { dimension: k, label, independent, usdMandatory: independent ? 0 : 1 };
  });
  const product = rows.reduce((p, r) => p * r.usdMandatory, 1);
  const blocked = rows.filter((r) => !r.independent).map((r) => r.dimension);
  return {
    mandatoryDollarDependency: product,
    independentDimensions: rows.filter((r) => r.independent).length,
    of: rows.length,
    rows,
    verdict: product === 0
      ? (blocked.length === 0
        ? 'Infrastructurally independent on all five dimensions. USD use is now an economic choice, not a technical requirement (§37).'
        : `Dependency product is 0 — the chain breaks at: ${blocked.join(', ')}. Note the product hits zero as soon as ANY single dimension is independent, which is why the per-dimension row is the meaningful read, not the product.`)
      : 'USD is mandatory on every dimension.',
    honestReading: `${rows.filter((r) => r.independent).length} of 5 dimensions are USD-independent. The paper's product formulation reaches 0 when any one factor is 0; the count is the operationally useful statistic.`,
  };
}
