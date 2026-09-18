/**
 * explain.js — show the working.
 *
 * Every figure the tool publishes is produced here a second time, as an ordered
 * list of steps carrying the symbolic formula, the SUBSTITUTED numbers and the
 * result, so a reader can follow the arithmetic and redo it by hand.
 *
 * The important property is that a derivation is CHECKED, not narrated. Each
 * chain recomputes its result from the recorded inputs and compares it against
 * the value the pipeline actually published. If the two ever disagree — because
 * the explanation drifted from the implementation, which is the usual fate of
 * hand-written "how this works" text — the step is flagged `reconciles: false`
 * and the discrepancy is printed. An explanation that cannot be wrong is not
 * evidence of anything.
 */

import { num, round, clamp, normInv } from './num.js';
import { INDICATORS, scoreIndicator, leadingWeight } from './metrics.js';
import { DEFAULT_WEIGHT_POLICY, quoteWeight } from './fx-fixing.js';
import { DEFAULT_ECONOMIC_WEIGHTS } from './basket.js';
import { BANDS } from './risk.js';

const fmt = (v, d = 6) => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (!Number.isFinite(v)) return String(v);
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-4 || a >= 1e9)) return v.toExponential(4);
  return Number(v.toFixed(d)).toLocaleString(undefined, { maximumFractionDigits: d });
};

/** One step of working. `group` heads a run of related steps in the UI. */
const step = (n, title, { section = null, formula = null, substitution = null, result = null, unit = null, note = null, rows = null, group = null }) =>
  ({ n, title, section, formula, substitution, result, unit, note, rows, group });

/**
 * Compare a recomputed value against what the pipeline published.
 *
 * The published figure is ROUNDED for display, and the derivation is not, so the
 * tolerance has to admit half a unit in the published value's last decimal
 * place. Holding a figure rounded to three decimals to a 1e-6 relative
 * tolerance fails it for existing — which is what happened here, on two of six
 * sample trades, and a check that cries wolf is worse than no check because it
 * teaches the reader to ignore it.
 *
 * @param {Object} opts {decimals} the precision the value was published at, or
 *   {tolerance} an explicit relative tolerance for unrounded figures.
 */
function reconcile(recomputed, published, opts = {}) {
  if (!Number.isFinite(recomputed) || !Number.isFinite(published)) {
    return { reconciles: recomputed === published, recomputed, published, note: 'non-numeric comparison' };
  }
  const { decimals = null, tolerance = 1e-9 } = typeof opts === 'number' ? { tolerance: opts } : opts;
  const diff = Math.abs(recomputed - published);
  const scale = Math.max(1, Math.abs(published));

  // Half a unit in the last published place, plus headroom for float noise that
  // accumulates over a long chain of additions.
  const roundingAllowance = decimals === null ? 0 : 0.5 * 10 ** -decimals;
  const floatAllowance = scale * tolerance;
  const allowed = Math.max(roundingAllowance, floatAllowance);

  return {
    reconciles: diff <= allowed,
    recomputed, published,
    absoluteDifference: diff,
    relativeDifference: diff / scale,
    allowedDifference: allowed,
    publishedAtDecimals: decimals,
  };
}

/* ═══════════════ 1. how one quote earned its weight (§8) ═══════════════ */

export function explainQuoteWeight(quote, policy = DEFAULT_WEIGHT_POLICY, nowMs = Date.now()) {
  const w = quoteWeight(quote, policy, nowMs);
  if (!w.parts) return { error: w.reject || 'quote rejected', quote };
  const p = w.parts;
  const steps = [
    step(1, 'Executable volume', {
      formula: 'w_volume = 2 * volume / (volume + volumeRef), capped at 1.5',
      substitution: `2 * ${fmt(num(quote.volume, 0), 0)} / (${fmt(num(quote.volume, 0), 0)} + ${fmt(policy.volumeRef, 0)})`,
      result: clamp(p.wVolume, 0, 1.5),
    }),
    step(2, 'Bid-ask spread', {
      formula: 'w_spread = spreadRef / (spreadRef + spread)',
      substitution: `${policy.spreadRefBps} / (${policy.spreadRefBps} + ${fmt(w.spreadBps, 2)})`,
      result: p.wSpread, unit: 'spread in bps',
    }),
    step(3, 'Book depth', {
      formula: 'w_depth = 2 * depth / (depth + depthRef), capped at 1.5',
      substitution: `2 * ${fmt(num(quote.depth, num(quote.volume, 0)), 0)} / (${fmt(num(quote.depth, num(quote.volume, 0)), 0)} + ${fmt(policy.depthRef, 0)})`,
      result: clamp(p.wDepth, 0, 1.5),
    }),
    step(4, 'Staleness', {
      formula: 'w_age = 0.5 ^ (age / halfLife)',
      substitution: `0.5 ^ (${fmt(w.ageSec, 1)}s / ${policy.stalenessHalfLifeSec}s)`,
      result: p.wAge,
      note: w.ageSec > policy.maxAgeSec ? `beyond the ${policy.maxAgeSec}s threshold — rejected outright` : null,
    }),
    step(5, 'Venue quality', {
      formula: 'w_venue = tier lookup',
      substitution: `tier ${num(quote.venueTier, 2)}`,
      result: p.wVenue,
    }),
    step(6, 'Combined weight', {
      formula: 'w = w_volume * w_spread * w_depth * w_age * w_venue',
      substitution: [clamp(p.wVolume, 0, 1.5), p.wSpread, clamp(p.wDepth, 0, 1.5), p.wAge, p.wVenue].map((x) => fmt(x, 4)).join(' × '),
      result: w.w,
      note: 'Multiplicative on purpose: a quote fails on its worst dimension rather than averaging a weakness away.',
    }),
  ];
  const recomputed = clamp(p.wVolume, 0, 1.5) * p.wSpread * clamp(p.wDepth, 0, 1.5) * p.wAge * p.wVenue;
  return {
    title: `Weight of the ${quote.base}/${quote.quote} quote at ${fmt(num(quote.rate, NaN), 6)}`,
    steps,
    check: reconcile(recomputed, w.w, { tolerance: 1e-12 }),
  };
}

/* ═══════════════ 2. the fixing (§8, §9) ═══════════════ */

export function explainFixing(fixing, pair = null) {
  if (!fixing?.ok) return { error: fixing?.reason || 'no fixing' };
  const d = fixing.diagnostics;
  const steps = [
    step(1, 'Partition the quotes', {
      section: '§37',
      formula: 'internal = quotes where BOTH legs are participating; external = the rest',
      substitution: `${d.internalQuotesUsed} internal, ${d.externalQuotesUsed} external`,
      result: `${fixing.participants.join(', ')} fitted internally; ${(fixing.external || []).join(', ') || 'none'} attached afterwards`,
      note: 'No external quote enters the system below, so the internal matrix cannot be moved by the vehicle currency.',
    }),
    step(2, 'Weight each quote', {
      section: '§8',
      formula: 'w_q = f(volume, spread, depth, age, venue)',
      substitution: `${d.quotesAccepted} quotes accepted, ${d.quotesRejected} rejected on entry`,
      result: `total weight ${fmt(d.totalWeight, 4)}`,
    }),
    step(3, 'Solve the weighted least squares', {
      section: '§8',
      formula: 'minimise SUM_q w_q * [ ln(FX_obs) - (p_i - p_j) ]^2,  subject to SUM_i p_i = 0',
      substitution: `${d.quotesAccepted} equations, ${fixing.participants.length} unknowns, ${d.dof} degrees of freedom`,
      result: `weighted RMSE ${fmt(d.weightedRMSEbps, 3)} bps`,
      note: 'The normal equations are a weighted graph Laplacian; the zero-sum constraint fixes the gauge, since only relative prices are identified.',
      rows: fixing.participants.map((c) => ({
        currency: c,
        shadowLogPrice: round(fixing.participantShadowLogPrices[c], 8),
        standardError: round(fixing.shadowPriceSE[c], 8),
      })),
    }),
    step(4, 'Reject outliers and refit', {
      section: '§9',
      formula: '|residual| / robustScale > k  →  drop, then refit',
      substitution: `k = 6, robust scale floored at the sample half-spread`,
      result: d.outliers.length ? `${d.outliers.length} rejected: ${d.outliers.map((o) => `${o.pair}@${fmt(o.rate, 4)} (z=${o.z})`).join(', ')}` : 'none rejected',
      note: 'Iteratively reweighted first, so a sound quote adjacent to a bad one is not rejected merely for being near it.',
    }),
    step(5, 'Attach external currencies', {
      section: '§37',
      formula: 'p_e = SUM_q w_q (p_other + sign * ln FX_obs) / SUM_q w_q,  with participant prices HELD FIXED',
      substitution: (d.satellites || []).map((s) => `${s.code}: ${s.quotesUsed} quote(s)`).join('; ') || 'none',
      result: (fixing.external || []).map((e) => `${e} = ${fmt(fixing.shadowLogPrices[e], 6)}`).join(', ') || '—',
    }),
    step(6, 'Publish every rate', {
      formula: 'FX_ij = exp(p_i - p_j)',
      substitution: 'for every ordered pair',
      result: `triangular consistency holds identically (max error ${fmt(d.maxRawTriangleInconsistencyBps, 2)} bps in the INPUT was resolved by construction)`,
    }),
  ];

  let check = null;
  if (pair) {
    const [a, b] = pair.split('/').map((x) => x.trim().toUpperCase());
    const pa = fixing.shadowLogPrices[a], pb = fixing.shadowLogPrices[b];
    if (Number.isFinite(pa) && Number.isFinite(pb)) {
      steps.push(step(7, `Worked example: ${a}/${b}`, {
        formula: `FX_${a}${b} = exp(p_${a} - p_${b})`,
        substitution: `exp(${fmt(pa, 8)} - ${fmt(pb, 8)}) = exp(${fmt(pa - pb, 8)})`,
        result: Math.exp(pa - pb),
        unit: `${b} per ${a}`,
      }));
      check = reconcile(Math.exp(pa - pb), fixing.rate(a, b), { tolerance: 1e-12 });
    }
  }
  return { title: 'Multilateral FX fixing', steps, check };
}

/* ═══════════════ 3. the basket (§6) ═══════════════ */

export function explainBasket(basket, fixing) {
  if (!basket || basket.error) return { error: basket?.error || 'no basket' };
  const w = { ...DEFAULT_ECONOMIC_WEIGHTS, ...(basket.config.economicWeights || {}) };
  const totalScore = basket.components.reduce((s, c) => s + c.economicScore, 0);

  const steps = [
    step(1, 'Economic score per currency', {
      section: '§6',
      formula: `score = ${w.intraNetworkTradeShare}*trade + ${w.gdpShare}*gdp + ${w.fxLiquidity}*liquidity + ${w.convertibility}*convertibility`,
      substitution: 'from the Currencies sheet',
      result: `total ${fmt(totalScore, 6)}`,
      rows: basket.components.map((c) => ({ code: c.code, economicScore: round(c.economicScore, 6) })),
      note: 'Debt sustainability is deliberately absent: §4 keeps the diagnostics out of the ruler.',
    }),
    step(2, 'Normalise to raw weights', {
      section: '§6',
      formula: 'rawWeight_i = score_i / SUM_j score_j',
      substitution: basket.components.map((c) => `${c.code}: ${fmt(c.economicScore, 4)}/${fmt(totalScore, 4)}`).join(', '),
      result: `sum = ${fmt(basket.components.reduce((s, c) => s + c.rawWeight, 0), 10)}`,
      rows: basket.components.map((c) => ({ code: c.code, rawWeight: round(c.rawWeight, 6), asPct: `${(c.rawWeight * 100).toFixed(2)}%` })),
    }),
    step(3, 'Cap and redistribute', {
      section: '§6',
      formula: `w_i = min(rawWeight_i, ${basket.config.maximumWeight}); the excess is shared among the uncapped, iterated to convergence`,
      substitution: basket.capped.length ? `capped: ${basket.capped.join(', ')}` : 'no currency exceeded the ceiling',
      result: `sum = ${fmt(basket.components.reduce((s, c) => s + c.finalWeight, 0), 10)}`,
      rows: basket.components.map((c) => ({ code: c.code, finalWeight: round(c.finalWeight, 6), asPct: `${(c.finalWeight * 100).toFixed(2)}%`, capped: c.capped })),
    }),
    step(4, 'Fix the quantities', {
      section: '§5',
      formula: `q_i = baseValue * w_i / FX_i,${basket.anchor}(base date)`,
      substitution: basket.components.map((c) => `${c.code}: ${basket.baseValue} × ${fmt(c.finalWeight, 4)} / ${fmt(c.baseRateVsAnchor, 6)}`).join('  ·  '),
      result: 'these quantities are now FIXED until the scheduled reconstitution',
      rows: basket.components.map((c) => ({ code: c.code, quantity: round(c.quantity, 8) })),
      note: `The anchor (${basket.anchor}) only sets the units of q. Later value ratios are invariant to that choice.`,
    }),
  ];

  let check = null;
  if (fixing?.ok) {
    const K = basket.anchor;
    let v = 0;
    const terms = [];
    for (const [c, q] of Object.entries(basket.quantities)) {
      const r = fixing.rate(c, K);
      v += q * r;
      terms.push(`${fmt(q, 4)}×${fmt(r, 6)}`);
    }
    steps.push(step(5, `Value one BCC-T in ${K}`, {
      section: '§5',
      formula: 'V_K = SUM_i q_i * FX_iK',
      substitution: terms.join(' + '),
      result: v, unit: K,
    }));
    check = reconcile(v, basket.baseValue, { tolerance: 1e-9 });
    check.note = `Equals the base value ${basket.baseValue} when valued in the anchor at the base-date fixing.`;
  }
  return { title: 'BCC-T constitution', steps, check };
}

/* ═══════════════ 4. one indicator (§11) ═══════════════ */

export function explainIndicator(key, rawValue) {
  const spec = INDICATORS[key];
  if (!spec) return { error: `unknown indicator "${key}"` };
  const scored = scoreIndicator(key, rawValue);
  if (scored.missing) return { title: spec.label, steps: [step(1, 'No value supplied', { result: 'excluded; the block index is computed from the remainder and its coverage falls' })] };

  const ref = spec.ref;
  const w = clamp(num(rawValue, NaN), ref.lo, ref.hi);
  const z = (w - ref.mean) / ref.sd;
  const raw = 50 + spec.dir * 10 * z;

  return {
    title: `${spec.label} (${key})`,
    steps: [
      step(1, 'Winsorise against the FIXED reference bounds', {
        section: '§11',
        formula: 'x_w = clamp(x, lo, hi)',
        substitution: `clamp(${fmt(num(rawValue, NaN), 6)}, ${ref.lo}, ${ref.hi})`,
        result: w,
        note: w !== num(rawValue, NaN) ? 'the raw value was outside the bounds and has been clipped' : null,
      }),
      step(2, 'Standardise', {
        section: '§11',
        formula: 'z = (x_w - mean_ref) / sd_ref',
        substitution: `(${fmt(w, 6)} - ${ref.mean}) / ${ref.sd}`,
        result: z,
        note: 'The reference mean and sd come from a fixed calibration sample, never from the current cross-section — which is what makes a score comparable across years.',
      }),
      step(3, 'Map to a score', {
        section: '§11',
        formula: `score = clamp(50 + direction * 10 * z, 0, 100), direction = ${spec.dir > 0 ? '+1 (higher is better)' : '-1 (higher is worse)'}`,
        substitution: `clamp(50 + ${spec.dir} × 10 × ${fmt(z, 4)}, 0, 100) = clamp(${fmt(raw, 4)}, 0, 100)`,
        result: scored.score,
        note: 'One reference standard deviation moves the score ten points, so a five-sigma reading saturates rather than dominating a composite.',
      }),
    ],
    check: reconcile(clamp(raw, 0, 100), scored.score, { decimals: 4 }),
  };
}

/* ═══════════════ 5. the invoice ═══════════════ */

export function explainInvoice(invoice, ctx = {}) {
  if (!invoice || invoice.error) return { error: invoice?.error || 'no invoice' };
  const cfg = invoice.audit.config;
  const inp = invoice.audit.inputs;
  const line = (k) => invoice.lines.find((l) => l.key === k);
  const bcct = (k) => line(k)?.amountBCCT ?? 0;
  const base = invoice.base.bcct;
  const vSell = invoice.numeraire.valueInSeller;
  const vBuy = invoice.numeraire.valueInBuyer;
  const usd = invoice.usdRoute;
  const cmp = invoice.comparison;
  const vehicle = usd?.vehicle || 'USD';

  const steps = [];
  let n = 0;
  const add = (title, opts) => { steps.push(step(++n, title, opts)); };

  /* ── A. the numeraire, derived rather than assumed ───────────────────── */
  const G_NUM = `The numeraire — what one BCC-T is worth on each side`;

  const basketTerms = (code) => (ctx.basket
    ? Object.entries(ctx.basket.quantities).map(([c, q]) => `${fmt(q, 4)}×${fmt(ctx.fixing?.rate(c, code) ?? NaN, 6)}`).join(' + ')
    : `SUM over the ${invoice.numeraire.basketVersion ? 'basket' : ''} components`);

  add(`One BCC-T in ${invoice.sellerCurrency} (the seller's currency)`, {
    group: G_NUM, section: '§5',
    formula: `V_${invoice.sellerCurrency} = SUM_i q_i × FX_i,${invoice.sellerCurrency}`,
    substitution: basketTerms(invoice.sellerCurrency),
    result: vSell, unit: invoice.sellerCurrency,
    note: 'The fixed quantity vector valued at this fixing. Anyone holding the published quantities and rates reproduces this number.',
  });
  add(`One BCC-T in ${invoice.buyerCurrency} (the destination currency)`, {
    group: G_NUM, section: '§5',
    formula: `V_${invoice.buyerCurrency} = SUM_i q_i × FX_i,${invoice.buyerCurrency}`,
    substitution: basketTerms(invoice.buyerCurrency),
    result: vBuy, unit: invoice.buyerCurrency,
    note: `Every figure below is converted to the destination currency with this one number. The implied cross is ${invoice.sellerCurrency}/${invoice.buyerCurrency} = V_${invoice.buyerCurrency} / V_${invoice.sellerCurrency} = ${fmt(vBuy / vSell, 6)}.`,
  });

  /* ── B. commercial base ──────────────────────────────────────────────── */
  const G_BASE = 'The commercial base';
  add('Commercial base in the seller currency', {
    group: G_BASE, section: '§5',
    formula: inp.qty && inp.unit ? 'base = quantity × unitPrice' : 'base = amount as supplied',
    substitution: inp.qty && inp.unit ? `${fmt(inp.qty, 0)} × ${fmt(inp.unit, 4)}` : fmt(invoice.base.local, 2),
    result: invoice.base.local, unit: invoice.sellerCurrency,
  });
  add('Convert it to the BCC-T numeraire', {
    group: G_BASE, section: '§5, §8',
    formula: `base_BCCT = base_local / V_${invoice.sellerCurrency}`,
    substitution: `${fmt(invoice.base.local, 2)} / ${fmt(vSell, 6)}`,
    result: base, unit: 'BCC-T',
  });
  add(`The same base seen by the buyer`, {
    group: G_BASE,
    formula: `base_${invoice.buyerCurrency} = base_BCCT × V_${invoice.buyerCurrency}`,
    substitution: `${fmt(base, 4)} × ${fmt(vBuy, 6)}`,
    result: base * vBuy, unit: invoice.buyerCurrency,
    note: 'What the goods alone are worth to the importer, before any settlement cost. Both routes below start here.',
  });

  /* ── C. common to both routes ────────────────────────────────────────── */
  const G_COMMON = 'Costs common to BOTH routes — these cancel in the comparison';
  add('Covered-interest carry to settlement', {
    group: G_COMMON, section: '§23',
    formula: 'F/S = (1 + i_buyer·T/basis) / (1 + i_seller·T/basis);  adj = base × (F/S − 1)',
    substitution: `T = ${invoice.settlementDays}d, basis = ${cfg.dayCountBasis}  →  ${fmt(line('forwardAdj')?.bps ?? 0, 2)} bps`,
    result: bcct('forwardAdj'), unit: 'BCC-T',
    note: 'Routing a payment differently does not change the interest differential between the two currencies.',
  });
  add('Unhedged FX premium', {
    group: G_COMMON, section: '§23',
    formula: 'premium = base × z × sigma × sqrt(T/252) × (1 − hedgeRatio)',
    substitution: inp.sigma
      ? `${fmt(base, 2)} × ${fmt(normInv(cfg.confidenceLevel), 4)} × ${fmt(inp.sigma, 4)} × sqrt(${invoice.settlementDays}/252) × (1 − ${inp.hedge})`
      : 'no volatility input — omitted, which understates both routes',
    result: bcct('volPremium'), unit: 'BCC-T',
    note: 'On a volatile pair this dwarfs every settlement cost below, which is why it is excluded from the route comparison.',
  });
  add('Counterparty condition', {
    group: G_COMMON, section: '§15',
    formula: 'adj = base × sensitivity × (neutral − composite)',
    substitution: invoice.composite
      ? `${fmt(base, 2)} × ${cfg.compositeSensitivity} × (${cfg.compositeNeutral} − ${fmt(invoice.composite.index, 2)})`
      : 'no indicators supplied',
    result: bcct('compositeAdj'), unit: 'BCC-T',
  });
  const commonTotal = bcct('forwardAdj') + bcct('volPremium') + bcct('compositeAdj');
  add('Common subtotal', {
    group: G_COMMON,
    formula: 'carry + premium + counterparty',
    substitution: `${fmt(bcct('forwardAdj'), 2)} + ${fmt(bcct('volPremium'), 2)} + ${fmt(bcct('compositeAdj'), 2)}`,
    result: commonTotal, unit: 'BCC-T',
    note: `${fmt((commonTotal / base) * 1e4, 1)} bps of the base — identical on both routes.`,
  });

  /* ── D. the direct route ─────────────────────────────────────────────── */
  const G_DIRECT = 'BCC-T direct — clearing inside the participating network';
  add('Conversion inside the participating network', {
    group: G_DIRECT, section: '§8, §28',
    formula: 'cost = base × spreadBps / 10000, along the cheapest path that does NOT transit the vehicle',
    substitution: `${fmt(base, 2)} × ${fmt(inp.directSpreadBps, 3)} / 10000   [${line('fxConversion')?.detail ?? ''}]`,
    result: bcct('fxConversion'), unit: 'BCC-T',
  });
  add('Counterparty credit at the CCP', {
    group: G_DIRECT, section: '§25',
    formula: 'charge = base × PD(band, T) × LGD',
    substitution: `${fmt(base, 2)} × ${fmt(inp.pd, 8)} × ${cfg.directRoute.lgd}   [band ${invoice.band.code}, PD ${fmt(BANDS[invoice.band.code]?.pdAnnual ?? 0, 4)}/yr × ${invoice.settlementDays}/365]`,
    result: bcct('creditCharge'), unit: 'BCC-T',
    note: 'A central counterparty stands between the parties and holds margin, so loss given default is lower than on a bare bilateral exposure.',
  });
  add('Initial-margin funding', {
    group: G_DIRECT, section: '§18, §25',
    formula: 'cost = base × IM × bandMultiplier × fundingRate × T/basis',
    substitution: `${fmt(base, 2)} × ${cfg.initialMarginRate} × ${BANDS[invoice.band.code]?.marginMultiplier ?? 1} × ${cfg.fundingRate} × ${invoice.settlementDays}/${cfg.dayCountBasis}`,
    result: bcct('marginFunding'), unit: 'BCC-T',
    note: 'The price of that margin: it has to be funded for the life of the cleared obligation.',
  });
  add('Clearing fee', {
    group: G_DIRECT, section: '§18',
    formula: 'fee = base × feeBps / 10000',
    substitution: `${fmt(base, 2)} × ${cfg.clearingFeeBps} / 10000`,
    result: bcct('clearingFee'), unit: 'BCC-T',
  });
  add('Netting rebate', {
    group: G_DIRECT, section: '§19',
    formula: 'rebate = − base × efficiency × passThrough × liquidityRate × settlementCycle/basis',
    substitution: `− ${fmt(base, 2)} × ${fmt(inp.eta, 4)} × ${cfg.nettingRebateShare} × ${cfg.liquidityCostRate} × ${cfg.settlementCycleDays}/${cfg.dayCountBasis}`,
    result: bcct('nettingRebate'), unit: 'BCC-T',
    note: 'Over the settlement CYCLE, not the credit period: nobody funds the settlement amount for the life of the invoice.',
  });
  add('Wrong-way loading', {
    group: G_DIRECT, section: '§24',
    formula: 'charge = base × PD × wrongWayAddon',
    substitution: `${fmt(base, 2)} × ${fmt(inp.pd, 8)} × ${fmt(inp.wrongWayAddon, 4)}`,
    result: bcct('wrongWaySurcharge'), unit: 'BCC-T',
  });
  const directInfra = ['fxConversion', 'creditCharge', 'marginFunding', 'clearingFee', 'nettingRebate', 'wrongWaySurcharge'].reduce((a, k) => a + bcct(k), 0);
  add('Direct infrastructure subtotal', {
    group: G_DIRECT,
    formula: 'conversion + credit + margin + clearing − netting + wrong-way',
    substitution: ['fxConversion', 'creditCharge', 'marginFunding', 'clearingFee', 'nettingRebate', 'wrongWaySurcharge'].map((k) => `${bcct(k) < 0 ? '−' : '+'}${fmt(Math.abs(bcct(k)), 2)}`).join(' '),
    result: directInfra, unit: 'BCC-T',
    note: `${fmt((directInfra / base) * 1e4, 2)} bps of the base.`,
  });

  /* ── E. the total, in every currency the user cares about ────────────── */
  const G_TOTAL = 'The invoice price';
  const sum = invoice.lines.reduce((a, l) => a + l.amountBCCT, 0);
  add('Add everything up', {
    group: G_TOTAL,
    formula: 'invoice = base + common + direct infrastructure',
    substitution: `${fmt(base, 2)} + ${fmt(commonTotal, 2)} + ${fmt(directInfra, 2)}`,
    result: sum, unit: 'BCC-T',
  });
  add(`Restate in ${invoice.sellerCurrency} — what the exporter receives`, {
    group: G_TOTAL,
    formula: `invoice_${invoice.sellerCurrency} = invoice_BCCT × V_${invoice.sellerCurrency}`,
    substitution: `${fmt(sum, 4)} × ${fmt(vSell, 6)}`,
    result: sum * vSell, unit: invoice.sellerCurrency,
  });
  add(`Restate in ${invoice.buyerCurrency} — WHAT THE IMPORTER PAYS`, {
    group: G_TOTAL,
    formula: `invoice_${invoice.buyerCurrency} = invoice_BCCT × V_${invoice.buyerCurrency}`,
    substitution: `${fmt(sum, 4)} × ${fmt(vBuy, 6)}`,
    result: sum * vBuy, unit: invoice.buyerCurrency,
    note: `Against a commercial base of ${fmt(base * vBuy, 2)} ${invoice.buyerCurrency}, so the settlement adds ${fmt(sum * vBuy - base * vBuy, 2)} ${invoice.buyerCurrency}.`,
  });
  add('Spread over the commercial base', {
    group: G_TOTAL,
    formula: 'spread = (invoice − base) / base × 10000',
    substitution: `(${fmt(sum, 2)} − ${fmt(base, 2)}) / ${fmt(base, 2)} × 10000`,
    result: ((sum - base) / base) * 1e4, unit: 'bps',
  });

  /* ── F. the incumbent route, derived the same way ────────────────────── */
  const checks = [
    { what: 'components sum to the published price', ...reconcile(sum, invoice.invoicePrice.bcct, { decimals: 6 }) },
    { what: `restatement in ${invoice.buyerCurrency}`, ...reconcile(sum * vBuy, invoice.invoicePrice.inBuyerCurrency, { decimals: 4 }) },
    { what: 'spread over base', ...reconcile(((sum - base) / base) * 1e4, invoice.invoicePrice.spreadOverBaseBps, { decimals: 3 }) },
  ];

  if (usd?.available) {
    const G_USD = `The incumbent route — settling through ${vehicle}`;
    const uline = (k) => usd.lines.find((l) => l.key === k);
    const u = (k) => uline(k)?.amountBCCT ?? 0;
    const uc = cfg.usdRoute;

    add(`Convert ${invoice.sellerCurrency} → ${vehicle} → ${invoice.buyerCurrency}`, {
      group: G_USD,
      formula: 'cost = base × (spread of leg 1 + spread of leg 2) / 10000',
      substitution: `${fmt(base, 2)} × ${uline('fxConversion')?.detail ?? ''} / 10000`,
      result: u('fxConversion'), unit: 'BCC-T',
      note: `Two conversions instead of one. The ${vehicle} legs are usually tighter than a participating cross, which is the incumbent's real advantage.`,
    });
    add('Settlement fees, both legs', {
      group: G_USD,
      formula: 'fee = base × 2 × feePerLeg / 10000',
      substitution: `${fmt(base, 2)} × 2 × ${uc.settlementFeePerLegBps} / 10000`,
      result: u('settlementFees'), unit: 'BCC-T',
    });
    add('Correspondent bank charges', {
      group: G_USD,
      formula: `cost = 2 × flatFee × FX_${vehicle},${invoice.sellerCurrency} / V_${invoice.sellerCurrency}`,
      substitution: `2 × ${uc.correspondentFeeFlat} ${vehicle}, restated in BCC-T`,
      result: u('correspondentFees'), unit: 'BCC-T',
      note: 'A flat fee is regressive: it bites on a small invoice and vanishes on a large one.',
    });
    add('Bilateral counterparty credit', {
      group: G_USD, section: '§18',
      formula: 'charge = base × PD(band, T) × LGD_bilateral',
      substitution: `${fmt(base, 2)} × ${fmt(inp.pd, 8)} × ${uc.bilateralLgd}`,
      result: u('counterpartyCredit'), unit: 'BCC-T',
      note: `The SAME importer, over the SAME horizon, as the CCP charge above — but unmargined and with nobody interposed, so loss given default is ${uc.bilateralLgd} rather than ${cfg.directRoute.lgd}. This is the single largest difference between the two routes.`,
    });
    add('In-flight exposure to the correspondent banks', {
      group: G_USD, section: '§18',
      formula: 'charge = base × PD_bank × (days / 365) × LGD × banks',
      substitution: `${fmt(base, 2)} × ${uc.correspondentPdAnnual} × ${uc.correspondentExposureDays}/365 × ${uc.correspondentLgd} × ${uc.correspondentCount}`,
      result: u('correspondentCredit'), unit: 'BCC-T',
      note: 'Only while the payment is in flight — the commercial credit period is exposure to the importer, charged above.',
    });
    add('Principal risk: no payment-versus-payment', {
      group: G_USD, section: '§18, §23',
      formula: 'charge = base × PD_bank × (days / 365) × LGD_principal',
      substitution: `${fmt(base, 2)} × ${uc.correspondentPdAnnual} × ${uc.principalRiskDays}/365 × ${uc.principalLgd}`,
      result: u('principalRisk'), unit: 'BCC-T',
      note: 'Priced as EXPECTED loss, which understates it: Herstatt risk is a tail and systemic exposure. The figure is not inflated to compensate.',
    });
    add('Nostro funding over the extra settlement day', {
      group: G_USD,
      formula: 'cost = base × fundingRate × extraDays / basis',
      substitution: `${fmt(base, 2)} × ${cfg.fundingRate} × ${uc.extraSettlementDays}/${cfg.dayCountBasis}`,
      result: u('nostroFloat'), unit: 'BCC-T',
    });
    add('Netting benefit', {
      group: G_USD, section: '§19',
      formula: 'none — correspondent banking settles gross',
      substitution: 'no multilateral compression is available on this route',
      result: 0, unit: 'BCC-T',
      note: `The direct route credited ${fmt(Math.abs(bcct('nettingRebate')), 2)} BCC-T here.`,
    });

    const usdInfra = usd.lines.reduce((a, l) => a + l.amountBCCT, 0);
    add(`${vehicle} infrastructure subtotal`, {
      group: G_USD,
      formula: 'conversion + fees + correspondent + credit + principal + nostro',
      substitution: usd.lines.map((l) => `+${fmt(l.amountBCCT, 2)}`).join(' '),
      result: usdInfra, unit: 'BCC-T',
      note: `${fmt((usdInfra / base) * 1e4, 2)} bps of the base.`,
    });
    add(`What the importer pays on the ${vehicle} route`, {
      group: G_USD,
      formula: `all-in = (base + common@T+${usd.settlementDays} + ${vehicle} infrastructure) × V_${invoice.buyerCurrency}`,
      substitution: `(${fmt(base, 2)} + ${fmt(usd.commonBCCT, 2)} + ${fmt(usdInfra, 2)}) × ${fmt(vBuy, 6)}`,
      result: usd.allInBCCT * vBuy, unit: invoice.buyerCurrency,
      note: `The common block is ${fmt(usd.commonBCCT - commonTotal, 2)} BCC-T larger than on the direct route, because the incumbent settles ${uc.extraSettlementDays} day later and carries one more day of unhedged FX risk.`,
    });

    /* ── G. the comparison ────────────────────────────────────────────── */
    const G_CMP = 'The comparison';
    const d = cmp.differential;
    add('Set aside what is identical on both routes', {
      group: G_CMP, section: '§28',
      formula: 'common = carry + FX premium + counterparty condition',
      substitution: `${fmt(commonTotal, 2)} BCC-T = ${fmt(d.commonToBothBps, 1)} bps`,
      result: d.commonToBothBps, unit: 'bps',
      note: 'Leaving this inside the comparison would let a number identical on both sides decide it.',
    });
    add('Compare the two infrastructures', {
      group: G_CMP,
      formula: 'difference = vehicle infrastructure − direct infrastructure',
      substitution: `${fmt(d.usdInfrastructureBps, 2)} − ${fmt(d.directInfrastructureBps, 2)}`,
      result: d.infrastructureDifferenceBps, unit: 'bps',
      note: `Positive means the direct route is cheaper. Verdict: ${cmp.cheaperInfrastructure}.`,
      rows: d.directDetail.map((x) => ({
        component: x.key,
        direct_bps: x.bps,
        vehicle_bps: d.usdDetail.find((y) => y.key === x.key || (x.key === 'creditCharge' && y.key === 'counterpartyCredit'))?.bps ?? 0,
      })).concat(d.usdDetail.filter((y) => !d.directDetail.some((x) => x.key === y.key || (x.key === 'creditCharge' && y.key === 'counterpartyCredit')))
        .map((y) => ({ component: y.key, direct_bps: 0, vehicle_bps: y.bps }))),
    });
    add('The all-in comparison, in the destination currency', {
      group: G_CMP,
      formula: `saving = all-in via ${vehicle} − all-in direct`,
      substitution: `${fmt(cmp.usdAllInBuyer, 2)} − ${fmt(cmp.directAllInBuyer, 2)}`,
      result: cmp.savingBuyerCurrency, unit: invoice.buyerCurrency,
      note: d.verdictsAgree
        ? `${fmt(cmp.savingBps, 1)} bps. Both readings agree: ${cmp.cheaperRoute} is cheaper.`
        : `${fmt(cmp.savingBps, 1)} bps — and this reverses the infrastructure verdict, because the extra settlement day is worth ${fmt(Math.abs(d.extraSettlementDayRiskBps), 1)} bps here. Hedge the exposure and the infrastructure comparison governs.`,
    });

    checks.push({ what: `${vehicle} route all-in`, ...reconcile(usd.allInBCCT * vBuy, cmp.usdAllInBuyer, { decimals: 4 }) });
    checks.push({ what: 'infrastructure difference', ...reconcile(((usdInfra - directInfra) / base) * 1e4, d.infrastructureDifferenceBps, { decimals: 3 }) });
  } else {
    add(`The incumbent route cannot be priced`, {
      group: 'The incumbent route',
      formula: '—',
      substitution: usd?.reason ?? 'no vehicle currency in this fixing',
      result: 'not available',
    });
  }

  return {
    title: `Invoice ${invoice.tradeId}: ${invoice.sellerCurrency} → ${invoice.buyerCurrency}, T+${invoice.settlementDays}`,
    steps,
    check: checks[0],
    checks,
  };
}

/* ═══════════════ rendering ═══════════════ */

/** Plain-text working, for export or for pasting into a review. */
export function toText(derivation) {
  if (derivation?.error) return `Cannot derive: ${derivation.error}`;
  const out = [derivation.title, '='.repeat(derivation.title.length), ''];
  let group = null;
  for (const s of derivation.steps) {
    if (s.group && s.group !== group) {
      group = s.group;
      out.push(`── ${group} ${'─'.repeat(Math.max(0, 72 - group.length))}`, '');
    }
    out.push(`${s.n}. ${s.title}${s.section ? `   [${s.section}]` : ''}`);
    if (s.formula) out.push(`     formula:  ${s.formula}`);
    if (s.substitution) out.push(`     with:     ${s.substitution}`);
    if (s.result !== null && s.result !== undefined) out.push(`     =         ${typeof s.result === 'number' ? fmt(s.result, 6) : s.result}${s.unit ? ` ${s.unit}` : ''}`);
    if (s.rows) for (const r of s.rows) out.push(`               ${Object.entries(r).map(([k, v]) => `${k}=${typeof v === 'number' ? fmt(v, 6) : v}`).join('  ')}`);
    if (s.note) out.push(`     note:     ${s.note}`);
    out.push('');
  }
  for (const c of derivation.checks ?? (derivation.check ? [{ what: 'result', ...derivation.check }] : [])) {
    out.push(c.reconciles
      ? `CHECK  ${c.what}: reconciles with the published value (${fmt(c.published, 6)})`
      : `CHECK  ${c.what}: DOES NOT RECONCILE — derived ${fmt(c.recomputed, 8)}, published ${fmt(c.published, 8)}, difference ${fmt(c.absoluteDifference, 10)} (allowed ${fmt(c.allowedDifference, 10)})`);
  }
  return out.join('\n');
}

export { fmt as formatValue };
