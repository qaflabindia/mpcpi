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

/** One step of working. */
const step = (n, title, { section = null, formula = null, substitution = null, result = null, unit = null, note = null, rows = null }) =>
  ({ n, title, section, formula, substitution, result, unit, note, rows });

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

  const steps = [
    step(1, 'Commercial base in the seller currency', {
      section: '§5',
      formula: inp.qty && inp.unit ? 'base = quantity × unitPrice' : 'base = amount as supplied',
      substitution: inp.qty && inp.unit ? `${fmt(inp.qty, 0)} × ${fmt(inp.unit, 4)}` : fmt(invoice.base.local, 2),
      result: invoice.base.local, unit: invoice.sellerCurrency,
    }),
    step(2, 'Convert to the BCC-T numeraire', {
      section: '§5, §8',
      formula: 'base_BCCT = base_local / V_seller,   V_seller = SUM_i q_i * FX_i,seller',
      substitution: `${fmt(invoice.base.local, 2)} / ${fmt(invoice.numeraire.valueInSeller, 6)}`,
      result: base, unit: 'BCC-T',
    }),
    step(3, 'Covered-interest carry to settlement', {
      section: '§23',
      formula: 'F/S = (1 + i_buyer·T/basis) / (1 + i_seller·T/basis);  adj = base × (F/S − 1)',
      substitution: `T = ${invoice.settlementDays}d, basis = ${cfg.dayCountBasis}  →  ${fmt(line('forwardAdj')?.bps ?? 0, 2)} bps`,
      result: bcct('forwardAdj'), unit: 'BCC-T',
      note: 'Route-independent: routing a payment differently does not change the interest differential between the two currencies.',
    }),
    step(4, 'Unhedged FX premium', {
      section: '§23',
      formula: 'premium = base × z × sigma × sqrt(T/252) × (1 − hedgeRatio)',
      substitution: inp.sigma
        ? `${fmt(base, 2)} × ${fmt(normInv(cfg.confidenceLevel), 4)} × ${fmt(inp.sigma, 4)} × sqrt(${invoice.settlementDays}/252) × (1 − ${inp.hedge})`
        : 'no volatility input — omitted, which understates both routes',
      result: bcct('volPremium'), unit: 'BCC-T',
      note: 'Also route-independent, and on a volatile pair it dwarfs everything else — which is why it is excluded from the route comparison.',
    }),
    step(5, 'Counterparty condition', {
      section: '§15',
      formula: 'adj = base × sensitivity × (neutral − composite)',
      substitution: invoice.composite
        ? `${fmt(base, 2)} × ${cfg.compositeSensitivity} × (${cfg.compositeNeutral} − ${fmt(invoice.composite.index, 2)})`
        : 'no indicators supplied',
      result: bcct('compositeAdj'), unit: 'BCC-T',
    }),
    step(6, 'Conversion inside the participating network', {
      section: '§8, §28',
      formula: 'cost = base × spreadBps / 10000,  spread from the cheapest path that does NOT transit the vehicle',
      substitution: `${fmt(base, 2)} × ${fmt(inp.directSpreadBps, 3)} / 10000   [${line('fxConversion')?.detail ?? ''}]`,
      result: bcct('fxConversion'), unit: 'BCC-T',
    }),
    step(7, 'Counterparty credit at the CCP', {
      section: '§25',
      formula: 'charge = base × PD(band, T) × LGD',
      substitution: `${fmt(base, 2)} × ${fmt(inp.pd, 8)} × ${cfg.directRoute.lgd}   [band ${invoice.band.code}, PD ${fmt(BANDS[invoice.band.code]?.pdAnnual ?? 0, 4)}/yr × ${invoice.settlementDays}/365]`,
      result: bcct('creditCharge'), unit: 'BCC-T',
    }),
    step(8, 'Initial-margin funding', {
      section: '§18, §25',
      formula: 'cost = base × IM × bandMultiplier × fundingRate × T/basis',
      substitution: `${fmt(base, 2)} × ${cfg.initialMarginRate} × ${BANDS[invoice.band.code]?.marginMultiplier ?? 1} × ${cfg.fundingRate} × ${invoice.settlementDays}/${cfg.dayCountBasis}`,
      result: bcct('marginFunding'), unit: 'BCC-T',
    }),
    step(9, 'Clearing fee', {
      section: '§18',
      formula: 'fee = base × feeBps / 10000',
      substitution: `${fmt(base, 2)} × ${cfg.clearingFeeBps} / 10000`,
      result: bcct('clearingFee'), unit: 'BCC-T',
    }),
    step(10, 'Netting rebate', {
      section: '§19',
      formula: 'rebate = − base × efficiency × passThrough × liquidityRate × settlementCycle/basis',
      substitution: `− ${fmt(base, 2)} × ${fmt(inp.eta, 4)} × ${cfg.nettingRebateShare} × ${cfg.liquidityCostRate} × ${cfg.settlementCycleDays}/${cfg.dayCountBasis}`,
      result: bcct('nettingRebate'), unit: 'BCC-T',
      note: 'Over the settlement CYCLE, not the credit period: nobody funds the settlement amount for the life of the invoice.',
    }),
    step(11, 'Wrong-way loading', {
      section: '§24',
      formula: 'charge = base × PD × wrongWayAddon',
      substitution: `${fmt(base, 2)} × ${fmt(inp.pd, 8)} × ${fmt(inp.wrongWayAddon, 4)}`,
      result: bcct('wrongWaySurcharge'), unit: 'BCC-T',
      note: 'An increment to the credit charge — the correlation loading only. Concentration breaches restrict credit capacity instead, and charging them here as well was double counting.',
    }),
  ];

  const sum = invoice.lines.reduce((s, l) => s + l.amountBCCT, 0);
  steps.push(step(12, 'Add them up', {
    formula: 'invoice = base + carry + premium + counterparty + conversion + credit + margin + clearing − netting + wrongWay',
    substitution: invoice.lines.map((l) => `${l.amountBCCT < 0 ? '−' : '+'}${fmt(Math.abs(l.amountBCCT), 2)}`).join(' '),
    result: sum, unit: 'BCC-T',
  }));
  steps.push(step(13, 'Restate in the buyer currency', {
    formula: 'invoice_buyer = invoice_BCCT × V_buyer',
    substitution: `${fmt(sum, 4)} × ${fmt(invoice.numeraire.valueInBuyer, 6)}`,
    result: sum * invoice.numeraire.valueInBuyer, unit: invoice.buyerCurrency,
  }));
  steps.push(step(14, 'Spread over the commercial base', {
    formula: 'spread = (invoice − base) / base × 10000',
    substitution: `(${fmt(sum, 2)} − ${fmt(base, 2)}) / ${fmt(base, 2)} × 10000`,
    result: ((sum - base) / base) * 1e4, unit: 'bps',
  }));

  return {
    title: `Invoice ${invoice.tradeId}: ${invoice.sellerCurrency} → ${invoice.buyerCurrency}, T+${invoice.settlementDays}`,
    steps,
    check: reconcile(sum, invoice.invoicePrice.bcct, { decimals: 6 }),
    checks: [
      // The decimals each figure is published at, from invoice.js.
      { what: 'components sum to the published price', ...reconcile(sum, invoice.invoicePrice.bcct, { decimals: 6 }) },
      { what: 'buyer-currency restatement', ...reconcile(sum * invoice.numeraire.valueInBuyer, invoice.invoicePrice.inBuyerCurrency, { decimals: 4 }) },
      { what: 'spread over base', ...reconcile(((sum - base) / base) * 1e4, invoice.invoicePrice.spreadOverBaseBps, { decimals: 3 }) },
    ],
  };
}

/* ═══════════════ rendering ═══════════════ */

/** Plain-text working, for export or for pasting into a review. */
export function toText(derivation) {
  if (derivation?.error) return `Cannot derive: ${derivation.error}`;
  const out = [derivation.title, '='.repeat(derivation.title.length), ''];
  for (const s of derivation.steps) {
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
