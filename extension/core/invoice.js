/**
 * invoice.js — the invoice price.
 *
 * The paper prices no invoice; it specifies the infrastructure an invoice would
 * sit on. This module builds the price as a TRANSPARENT ADDITIVE DECOMPOSITION
 * over the BCC-T numeraire, so that every currency unit charged to an importer
 * is traceable to a named clause of the framework:
 *
 *   base            commercial value converted at the §8 fixing         §5, §8
 * + forwardAdj      covered-interest-parity carry to settlement date    §23
 * + volPremium      unhedged FX risk over the settlement lag            §23
 * + creditCharge    counterparty PD from the §25 supervisory band       §25
 * + marginFunding   cost of carrying initial margin to settlement       §18, §25
 * + clearingFee     BCCC fee on the cleared notional                    §18
 * - nettingRebate   share of realised multilateral compression          §19
 * + wrongWaySurch   collateral / participant correlation loading        §24
 * + compositeAdj    horizon-weighted leading/lagging risk deviation     §15
 * ────────────────────────────────────────────────────────────────────
 * = invoice price in BCC-T, then restated in any participating currency
 *
 * Alongside it the module prices the SAME trade through the incumbent
 * USD-intermediated route (two legs, two spreads, two settlement fees) so the
 * comparison of §28 and §37 is an arithmetic result rather than a claim.
 *
 * Every term is signed, labelled and individually recoverable. Nothing is
 * folded into a single opaque "risk margin".
 */

import { num, clamp, round, normInv, sum } from './num.js';
import { BANDS } from './risk.js';
import { composite, scoreObservation, crossVol, leadingWeight } from './metrics.js';

export const DEFAULT_PRICING_CONFIG = {
  confidenceLevel: 0.95,        // z for the unhedged FX volatility premium
  tauDays: 90,                  // leading/lagging horizon constant
  tradingDaysPerYear: 252,
  dayCountBasis: 360,
  clearingFeeBps: 1.5,          // BCCC fee on cleared notional
  settlementFeeFlat: 0,         // per-leg flat fee, in the seller's currency
  nettingRebateShare: 0.50,     // share of realised compression passed to users
  liquidityCostRate: 0.045,     // annual cost of the liquidity that netting saves
  /** Length of the settlement cycle itself. Netting frees liquidity for THIS
   *  long, not for the whole commercial credit period: nobody funds the
   *  settlement amount for the ninety days an invoice is outstanding. Using T
   *  here overstated the rebate by more than an order of magnitude. */
  settlementCycleDays: 2,
  initialMarginRate: 0.02,      // base IM before the band multiplier
  fundingRate: 0.055,           // annual funding cost of posted margin
  lgd: 0.45,                    // loss given default on the settlement exposure
  compositeSensitivity: 0.0015, // price impact per point of composite-risk deviation
  compositeNeutral: 50,         // composite index level that costs nothing
  vehicleCurrency: 'USD',       // the incumbent bridge the direct route must avoid

  directRoute: {
    /** null = derive the conversion cost from the user's own quotes, along the
     *  cheapest path that stays INSIDE the participating network. A thin cross
     *  is then priced as thin, which is the real obstacle of §28. */
    spreadBps: null,
    /** CCP exposure is margined, so loss given default is lower than on an
     *  unmargined bilateral correspondent exposure. */
    lgd: 0.35,
  },

  usdRoute: {
    /** null = use the observed spreads on the two vehicle legs. */
    legSpreadBps: null,
    settlementFeePerLegBps: 1.2,
    correspondentFeeFlat: 25,       // nostro/correspondent charge per leg, USD
    extraSettlementDays: 1,
    /** Correspondent banking has no central counterparty. Two intermediary
     *  banks each carry an unmargined exposure for the settlement window. */
    correspondentPdAnnual: 0.004,
    correspondentCount: 2,
    correspondentLgd: 0.60,
    /** Correspondent banks are exposed while the payment is in flight, not for
     *  the life of the commercial credit. That exposure belongs to the importer
     *  and is charged separately on both routes. */
    correspondentExposureDays: 2,
    /** Bilateral exposure to the importer is unmargined and has no CCP between
     *  the parties, so loss given default is higher than on the cleared route. */
    bilateralLgd: 0.60,
    /** Without payment-versus-payment the full principal is at risk across the
     *  settlement overlap — the exposure §18 cites PvP as eliminating. */
    principalRiskDays: 1,
    principalLgd: 0.60,
  },
};

const clampPct = (x) => (Number.isFinite(x) ? x : 0);

/**
 * Covered interest parity forward factor.
 *   F/S = (1 + i_quote * T/basis) / (1 + i_base * T/basis)
 * Expressed as units of `quote` per unit of `base`, consistent with the fixing.
 */
export function forwardFactor(rateBase, rateQuote, days, basis = 360) {
  const t = Math.max(0, num(days, 0)) / basis;
  const ib = num(rateBase, 0), iq = num(rateQuote, 0);
  const f = (1 + iq * t) / (1 + ib * t);
  return { factor: f, forwardPointsBps: (f - 1) * 1e4, t, formula: 'F/S = (1 + i_quote*T/basis) / (1 + i_base*T/basis)' };
}

/** Value of one BCC-T unit expressed in `code`, from a basket + fixing. */
function bcctValue(basket, fixing, code) {
  let v = 0;
  for (const [c, q] of Object.entries(basket.quantities)) {
    const r = fixing.rate(c, code);
    if (!Number.isFinite(r)) return NaN;
    v += q * r;
  }
  return v;
}

/**
 * Price one invoice.
 *
 * @param {Object} trade
 *   {id, description, quantity, unitPrice, sellerCurrency, buyerCurrency,
 *    settlementDays, hedgeRatio, incoterm, sector, exporter, importer}
 * @param {Object} ctx
 *   {fixing, basket, rates:{CCY:policyRate}, vols:{CCY:annualVol}, correlations,
 *    bands:{PARTICIPANT:bandInfo}, collateral:{PARTICIPANT:valuation},
 *    metrics:{PARTICIPANT|CCY: indicatorObservation}, nettingEfficiency, config}
 */
export function priceInvoice(trade, ctx = {}) {
  const cfg = { ...DEFAULT_PRICING_CONFIG, ...(ctx.config || {}), usdRoute: { ...DEFAULT_PRICING_CONFIG.usdRoute, ...(ctx.config?.usdRoute || {}) } };
  const { fixing, basket } = ctx;
  const errors = [], notes = [];

  const sell = String(trade.sellerCurrency || trade.ccySell || '').toUpperCase();
  const buy = String(trade.buyerCurrency || trade.ccyBuy || '').toUpperCase();
  const qty = num(trade.quantity, 1);
  const unit = num(trade.unitPrice, NaN);
  const explicitBase = num(trade.baseAmount ?? trade.amount, NaN);
  const T = Math.max(0, num(trade.settlementDays, 2));
  const hedge = clamp(num(trade.hedgeRatio, 0), 0, 1);

  if (!fixing?.ok) return { error: 'no valid FX fixing; the invoice cannot be priced (§9 disruption clause applies)' };
  if (!basket || basket.error) return { error: 'no BCC-T basket constituted' };
  if (!sell) errors.push('seller currency missing');
  if (!buy) errors.push('buyer currency missing');
  const baseLocal = Number.isFinite(explicitBase) ? explicitBase : qty * unit;
  if (!Number.isFinite(baseLocal) || baseLocal <= 0) errors.push('commercial base value is not a positive number');
  if (errors.length) return { error: errors.join('; '), errors };

  const vSell = bcctValue(basket, fixing, sell);
  const vBuy = bcctValue(basket, fixing, buy);
  if (!Number.isFinite(vSell) || !Number.isFinite(vBuy)) {
    return { error: `BCC-T cannot be valued in ${sell} or ${buy} from this fixing (§9 fallback hierarchy applies)` };
  }

  // ── 1. Commercial base, converted to the numeraire (§5, §8) ──────────────
  const baseBCCT = baseLocal / vSell;

  // ══ COMMON components ════════════════════════════════════════════════════
  // Route-independent by construction: the interest differential, the market
  // risk of the goods price and the counterparty's condition do not change
  // because the payment is routed differently. They are charged to BOTH routes
  // and reported separately, because leaving them inside only one total is what
  // made the earlier comparison meaningless — they dominate both numbers and
  // very nearly cancel.

  // 2. Covered-interest carry to the settlement date (§23)
  const iSell = num(ctx.rates?.[sell], NaN), iBuy = num(ctx.rates?.[buy], NaN);
  let fwd = { factor: 1, forwardPointsBps: 0, t: T / cfg.dayCountBasis, formula: 'not applied' };
  if (Number.isFinite(iSell) && Number.isFinite(iBuy)) {
    fwd = forwardFactor(iSell, iBuy, T, cfg.dayCountBasis);
  } else {
    notes.push(`No policy rate for ${!Number.isFinite(iSell) ? sell : buy}; the CIP carry term is omitted rather than guessed.`);
  }
  const forwardAdj = baseBCCT * (fwd.factor - 1);

  // 3. Unhedged FX volatility premium (§23)
  const volSell = num(ctx.vols?.[sell], NaN), volBuy = num(ctx.vols?.[buy], NaN);
  const rho = num(ctx.correlations?.[`${sell}|${buy}`] ?? ctx.correlations?.[`${buy}|${sell}`], 0.3);
  let sigma = NaN;
  if (Number.isFinite(volSell) && Number.isFinite(volBuy)) sigma = crossVol(volSell, volBuy, rho);
  else if (Number.isFinite(volSell)) sigma = volSell;
  else if (Number.isFinite(volBuy)) sigma = volBuy;
  const z = normInv(cfg.confidenceLevel);
  const volPremiumAt = (days) => (Number.isFinite(sigma) ? baseBCCT * z * sigma * Math.sqrt(days / cfg.tradingDaysPerYear) * (1 - hedge) : 0);
  const volPremium = volPremiumAt(T);
  if (!Number.isFinite(sigma)) notes.push('No volatility input for either currency; the unhedged FX premium is omitted, which UNDERSTATES both routes.');

  // 4. Counterparty condition from the leading/lagging blend (§15 convention)
  const importer = String(trade.importer || trade.buyer || buy).toUpperCase();
  const obs = ctx.metrics?.[importer] || ctx.metrics?.[buy] || null;
  let comp = null, compositeAdj = 0;
  if (obs) {
    const scored = scoreObservation(obs);
    comp = composite(scored, T, cfg.tauDays);
    if (comp.index !== null) compositeAdj = baseBCCT * cfg.compositeSensitivity * (cfg.compositeNeutral - comp.index);
  } else {
    notes.push('No leading/lagging indicators for the counterparty; the composite adjustment is zero and neither route carries a forward-looking signal.');
  }

  const commonLines = [
    { key: 'forwardAdj', label: `Covered-interest carry to T+${T}`, section: '§23', amountBCCT: forwardAdj, detail: `${round(fwd.forwardPointsBps, 2)} bps` },
    { key: 'volPremium', label: `Unhedged FX premium (${(cfg.confidenceLevel * 100).toFixed(0)}%, hedge ${(hedge * 100).toFixed(0)}%)`, section: '§23', amountBCCT: volPremium, detail: Number.isFinite(sigma) ? `sigma ${(sigma * 100).toFixed(2)}% ann.` : 'no vol input' },
    { key: 'compositeAdj', label: 'Counterparty leading/lagging adjustment', section: '§15', amountBCCT: compositeAdj, detail: comp ? `composite ${comp.index}, w_lead ${comp.leadingWeight}` : 'no indicators' },
  ];
  const commonTotal = sum(commonLines.map((l) => l.amountBCCT));

  // ══ DIRECT route: inside the participating network ═══════════════════════

  // 5. Conversion cost, from the user's own quotes, WITHOUT the vehicle currency.
  const vehicle = String(cfg.vehicleCurrency || 'USD').toUpperCase();
  let directPath = { bps: NaN, path: null };
  if (typeof fixing.conversionPath === 'function') directPath = fixing.conversionPath(sell, buy, { exclude: [vehicle] });
  let directSpreadBps = num(cfg.directRoute.spreadBps, NaN);
  if (!Number.isFinite(directSpreadBps)) directSpreadBps = directPath.bps;
  if (!Number.isFinite(directSpreadBps)) {
    directSpreadBps = 0;
    notes.push(`No executable ${sell}/${buy} path inside the participating network, so the direct conversion cost is 0 by omission — which FLATTERS the direct route. Supply quotes for the participating crosses.`);
  }
  const fxConversion = baseBCCT * (directSpreadBps / 1e4);

  // 6. Counterparty credit at the CCP (§25). Margined, so a lower LGD than a
  //    bilateral correspondent exposure.
  const bandInfo = ctx.bands?.[importer] || ctx.bands?.[buy] || null;
  const band = BANDS[bandInfo?.band] || BANDS.B;
  if (!bandInfo) notes.push(`No supervisory band for ${importer}; band B assumed. Set it in the Participants sheet.`);
  const pd = band.pdAnnual * (T / 365);
  const creditCharge = baseBCCT * pd * cfg.directRoute.lgd;

  // 7. Initial-margin funding (§18, §25)
  const imRate = cfg.initialMarginRate * band.marginMultiplier;
  const marginFunding = baseBCCT * imRate * cfg.fundingRate * (T / cfg.dayCountBasis);

  // 8. Clearing fee (§18)
  const clearingFee = baseBCCT * (cfg.clearingFeeBps / 1e4);

  // 9. Netting rebate (§19)
  const eta = clamp(num(ctx.nettingEfficiency, 0), 0, 1);
  const nettingRebate = -baseBCCT * eta * cfg.nettingRebateShare * cfg.liquidityCostRate * (cfg.settlementCycleDays / cfg.dayCountBasis);
  if (!ctx.nettingEfficiency) notes.push('No realised netting efficiency supplied; no rebate is credited. Run the netting tab to earn one.');

  // 10. Wrong-way loading (§24) — an INCREMENT TO THE CREDIT CHARGE, which is
  //     what wrong-way risk is. It scales with the correlation loading on the
  //     collateral, not with the pool's whole effective haircut: concentration
  //     breaches restrict credit capacity, and charging them here as well was
  //     double-counting worth 220 bps on this trade.
  const coll = ctx.collateral?.[importer];
  const wwAddon = num(coll?.wrongWayAddon, 0);
  const wrongWaySurcharge = baseBCCT * pd * wwAddon;

  const directLines = [
    { key: 'fxConversion', label: 'Conversion inside the participating network', section: '§8, §28', amountBCCT: fxConversion, detail: directPath.path ? `${round(directSpreadBps, 2)} bps via ${directPath.path.join('→')}` : `${round(directSpreadBps, 2)} bps` },
    { key: 'creditCharge', label: `Counterparty credit at the CCP, band ${band.name}`, section: '§25', amountBCCT: creditCharge, detail: `PD ${(pd * 1e4).toFixed(2)} bps x LGD ${(cfg.directRoute.lgd * 100).toFixed(0)}%` },
    { key: 'marginFunding', label: 'Initial-margin funding', section: '§18, §25', amountBCCT: marginFunding, detail: `IM ${(imRate * 100).toFixed(2)}% x ${(cfg.fundingRate * 100).toFixed(2)}%` },
    { key: 'clearingFee', label: 'BCCC clearing fee', section: '§18', amountBCCT: clearingFee, detail: `${cfg.clearingFeeBps} bps` },
    { key: 'nettingRebate', label: 'Multilateral netting rebate', section: '§19', amountBCCT: nettingRebate, detail: `${(eta * 100).toFixed(1)}% compression, ${(cfg.nettingRebateShare * 100).toFixed(0)}% passed through, over a ${cfg.settlementCycleDays}-day cycle` },
    { key: 'wrongWaySurcharge', label: 'Collateral wrong-way loading', section: '§24', amountBCCT: wrongWaySurcharge, detail: `correlation loading ${(wwAddon * 100).toFixed(1)}% on PD` },
  ];
  const directInfraTotal = sum(directLines.map((l) => l.amountBCCT));

  // ══ USD route: the incumbent, with the costs it actually bears ═══════════
  const usd = priceUsdRoute({ baseBCCT, vSell, sell, buy, T, fixing, cfg, vehicle, volPremiumAt, commonTotal, pd });

  // ── Assemble the direct-route build-up (what the invoice charges) ────────
  const lines = [
    { key: 'base', label: 'Commercial base at the multilateral fixing', section: '§5, §8', amountBCCT: baseBCCT, sign: '+' },
    ...commonLines,
    ...directLines,
  ].map((l) => ({ ...l, sign: l.amountBCCT >= 0 ? '+' : '-' }));

  const totalBCCT = sum(lines.map((l) => l.amountBCCT));
  const spreadOverBaseBps = baseBCCT > 0 ? ((totalBCCT - baseBCCT) / baseBCCT) * 1e4 : 0;

  for (const l of lines) {
    l.amountBCCT = round(l.amountBCCT, 6);
    l.amountSeller = round(l.amountBCCT * vSell, 4);
    l.amountBuyer = round(l.amountBCCT * vBuy, 4);
    l.bps = baseBCCT > 0 ? round((l.amountBCCT / baseBCCT) * 1e4, 3) : 0;
    l.shareOfSpread = spreadOverBaseBps !== 0 && l.key !== 'base' ? round(l.bps / spreadOverBaseBps, 4) : null;
    l.block = l.key === 'base' ? 'base' : commonLines.some((c) => c.key === l.key) ? 'common' : 'direct';
  }

  const directAllInBuyer = totalBCCT * vBuy;
  const usdAllInBuyer = usd.available ? usd.allInBCCT * vBuy : null;
  const toBps = (x) => (baseBCCT > 0 ? round((x / baseBCCT) * 1e4, 3) : null);

  return {
    tradeId: trade.id ?? null,
    description: trade.description ?? null,
    exporter: trade.exporter ?? null,
    importer: trade.importer ?? null,
    sellerCurrency: sell,
    buyerCurrency: buy,
    settlementDays: T,
    hedgeRatio: hedge,
    numeraire: {
      unit: 'BCC-T',
      valueInSeller: round(vSell, 8),
      valueInBuyer: round(vBuy, 8),
      basketVersion: basket.version,
      basketBaseDate: basket.baseDate,
      fixingAsOf: fixing.asOf,
    },
    base: { local: round(baseLocal, 4), currency: sell, bcct: round(baseBCCT, 6) },
    lines,
    invoicePrice: {
      bcct: round(totalBCCT, 6),
      inSellerCurrency: round(totalBCCT * vSell, 4),
      inBuyerCurrency: round(directAllInBuyer, 4),
      spreadOverBaseBps: round(spreadOverBaseBps, 3),
      spreadOverBasePct: round(spreadOverBaseBps / 100, 5),
    },
    band: { code: band.name, label: band.label, source: bandInfo ? 'supplied' : 'assumed' },
    composite: comp,
    usdRoute: usd,
    comparison: usd.available ? {
      directAllInBuyer: round(directAllInBuyer, 4),
      usdAllInBuyer: round(usdAllInBuyer, 4),
      savingBuyerCurrency: round(usdAllInBuyer - directAllInBuyer, 4),
      savingBps: round(((usdAllInBuyer - directAllInBuyer) / directAllInBuyer) * 1e4, 3),
      cheaperRoute: usdAllInBuyer > directAllInBuyer ? 'BCC-T direct' : 'USD-intermediated',
      /**
       * The all-in verdict includes one extra day of unhedged FX risk on the
       * incumbent's longer settlement, which on a volatile pair can be larger
       * than the entire infrastructure difference. That is a real cost, but it
       * is a consequence of the settlement calendar rather than of the clearing
       * design, so the two verdicts are reported separately and flagged when
       * they disagree.
       */
      cheaperInfrastructure: usd.infraTotalBCCT > directInfraTotal ? 'BCC-T direct' : 'USD-intermediated',
      /**
       * The comparison that means something. Both routes carry the same
       * commercial FX risk and the same interest carry; those cancel. What is
       * actually being compared is two settlement infrastructures.
       */
      differential: {
        commonToBothBps: toBps(commonTotal),
        commonNote: 'Interest carry, unhedged FX risk and counterparty condition. Identical on both routes and excluded from the comparison below.',
        directInfrastructureBps: toBps(directInfraTotal),
        usdInfrastructureBps: toBps(usd.infraTotalBCCT),
        infrastructureDifferenceBps: round(toBps(usd.infraTotalBCCT) - toBps(directInfraTotal), 3),
        extraSettlementDayRiskBps: toBps(usd.commonBCCT - commonTotal),
        directDetail: directLines.map((l) => ({ key: l.key, bps: toBps(l.amountBCCT), label: l.label })),
        usdDetail: usd.lines.map((l) => ({ key: l.key, bps: toBps(l.amountBCCT), label: l.label })),
        verdictsAgree: (usdAllInBuyer > directAllInBuyer) === (usd.infraTotalBCCT > directInfraTotal),
      },
      reading: (() => {
        const allIn = usdAllInBuyer > directAllInBuyer ? 'direct' : 'usd';
        const infra = usd.infraTotalBCCT > directInfraTotal ? 'direct' : 'usd';
        const base = infra === 'direct'
          ? 'On infrastructure alone the direct route is cheaper here, mostly because a central counterparty mitigates the importer\'s credit risk and multilateral netting frees settlement liquidity. §28 still applies: a cost advantage does not by itself overcome the incumbent network equilibrium.'
          : 'On infrastructure alone the dollar route is cheaper here. Look at the conversion line — if the participating crosses are thinly quoted, this is a liquidity result, not a technology result, and it is exactly the obstacle §28 describes. That is an economic choice, which §37 says should remain available.';
        if (allIn === infra) return base;
        return `${base} Note that the all-in verdict points the other way: the incumbent settles one day later, and that extra day of unhedged FX risk is worth ${Math.abs(toBps(usd.commonBCCT - commonTotal)).toFixed(1)} bps here — more than the whole infrastructure difference. Hedge the exposure and the infrastructure comparison is the one that governs.`;
      })(),
    } : { unavailable: usd.reason },
    notes,
    audit: {
      formula: 'InvoicePrice_BCCT = base + [carry + FX premium + counterparty] + [conversion + credit + margin + clearing - netting + wrong-way]',
      blocks: { common: round(commonTotal, 6), directInfrastructure: round(directInfraTotal, 6) },
      config: cfg,
      inputs: { baseLocal, qty, unit, T, hedge, sigma: Number.isFinite(sigma) ? round(sigma, 6) : null, rho, pd: round(pd, 8), eta, wrongWayAddon: wwAddon, directSpreadBps: round(directSpreadBps, 3) },
      reproducible: true,
    },
  };
}

/**
 * The incumbent route: seller ccy → vehicle → buyer ccy.
 *
 * Priced with the costs correspondent banking actually bears, not merely its
 * spreads. The earlier version charged the direct route for an explicit,
 * collateralised, risk-managed clearing layer and charged the incumbent for
 * nothing but two spreads — which guaranteed the incumbent looked cheap. The
 * two additions that matter are principal risk, because correspondent banking
 * has no payment-versus-payment (§18 cites PvP as eliminating exactly this),
 * and unmargined credit exposure to the intermediary banks.
 *
 * The honest caveat, stated in the output: both are priced as EXPECTED loss.
 * Herstatt risk is a tail and systemic exposure, so expected-loss pricing
 * understates it. This function does not inflate it to compensate.
 */
function priceUsdRoute({ baseBCCT, vSell, sell, buy, T, fixing, cfg, vehicle, volPremiumAt, commonTotal, pd }) {
  const legIn = fixing.rate(sell, vehicle), legOut = fixing.rate(vehicle, buy);
  if (!Number.isFinite(legIn) || !Number.isFinite(legOut)) {
    return {
      available: false,
      reason: `${vehicle} is not in this fixing, so the incumbent route cannot be priced. On these inputs the vehicle currency is not available as a bridge at all — the §37 bridgeFX dimension is satisfied trivially.`,
    };
  }
  const u = cfg.usdRoute;
  const Tu = T + u.extraSettlementDays;

  // Conversion: the two vehicle legs, from the user's own quotes where possible.
  let legBps = num(u.legSpreadBps, NaN);
  let path = null;
  if (!Number.isFinite(legBps) && typeof fixing.conversionPath === 'function') {
    const inLeg = fixing.conversionPath(sell, vehicle);
    const outLeg = fixing.conversionPath(vehicle, buy);
    if (Number.isFinite(inLeg.bps) && Number.isFinite(outLeg.bps)) {
      legBps = inLeg.bps + outLeg.bps;
      path = [...(inLeg.path || []), ...(outLeg.path || []).slice(1)];
    }
  }
  if (!Number.isFinite(legBps)) legBps = 8;      // two typical major legs
  const fxConversion = baseBCCT * (legBps / 1e4);

  const settlementFees = baseBCCT * (2 * u.settlementFeePerLegBps / 1e4);

  // Two flat correspondent charges, quoted in the vehicle currency, restated in
  // the numeraire. A flat fee is regressive: it bites on small invoices and
  // vanishes on large ones, which is itself part of the incumbent's economics.
  const vehicleInSell = fixing.rate(vehicle, sell);
  const correspondentFees = (Number.isFinite(vehicleInSell) && vSell > 0)
    ? (2 * u.correspondentFeeFlat * vehicleInSell) / vSell
    : 0;

  // The importer's credit risk exists on BOTH routes. What differs is the
  // mitigation: cleared and margined here, bare bilateral exposure there.
  const bilateralCredit = baseBCCT * num(pd, 0) * u.bilateralLgd;
  const principalRisk = baseBCCT * u.correspondentPdAnnual * (u.principalRiskDays / 365) * u.principalLgd;
  const correspondentCredit = baseBCCT * u.correspondentPdAnnual * (u.correspondentExposureDays / 365) * u.correspondentLgd * u.correspondentCount;
  const nostroFloat = baseBCCT * cfg.fundingRate * (u.extraSettlementDays / cfg.dayCountBasis);

  const lines = [
    { key: 'fxConversion', label: `Conversion via ${vehicle}, two legs`, section: '—', amountBCCT: fxConversion, detail: path ? `${round(legBps, 2)} bps via ${path.join('→')}` : `${round(legBps, 2)} bps` },
    { key: 'settlementFees', label: 'Settlement fees, two legs', section: '—', amountBCCT: settlementFees, detail: `${u.settlementFeePerLegBps} bps per leg` },
    { key: 'correspondentFees', label: 'Correspondent bank charges, two legs', section: '—', amountBCCT: correspondentFees, detail: `${u.correspondentFeeFlat} ${vehicle} per leg, flat` },
    { key: 'counterpartyCredit', label: 'Bilateral counterparty credit, no CCP interposed', section: '§18', amountBCCT: bilateralCredit, detail: `PD ${(pd * 1e4).toFixed(2)} bps x LGD ${(u.bilateralLgd * 100).toFixed(0)}% (unmargined)` },
    { key: 'correspondentCredit', label: `In-flight exposure to ${u.correspondentCount} correspondent banks`, section: '§18', amountBCCT: correspondentCredit, detail: `PD ${(u.correspondentPdAnnual * 1e4).toFixed(0)} bps p.a. x LGD ${(u.correspondentLgd * 100).toFixed(0)}% over ${u.correspondentExposureDays} day(s)` },
    { key: 'principalRisk', label: 'Principal risk: no payment-versus-payment', section: '§18, §23', amountBCCT: principalRisk, detail: `full principal exposed for ${u.principalRiskDays} day(s)` },
    { key: 'nostroFloat', label: 'Nostro funding over the extra settlement day', section: '—', amountBCCT: nostroFloat, detail: `${(cfg.fundingRate * 100).toFixed(2)}% for ${u.extraSettlementDays} day(s)` },
    { key: 'nettingRebate', label: 'Netting benefit: none, settles gross', section: '§19', amountBCCT: 0, detail: 'correspondent banking does not net multilaterally' },
  ];

  const infraTotalBCCT = sum(lines.map((l) => l.amountBCCT));
  // The incumbent bears the same commercial risk, over one more day.
  const commonForUsd = commonTotal - volPremiumAt(T) + volPremiumAt(Tu);
  const allInBCCT = baseBCCT + commonForUsd + infraTotalBCCT;

  return {
    available: true,
    vehicle,
    settlementDays: Tu,
    legs: [
      { leg: `${sell} → ${vehicle}`, rate: round(legIn, 8) },
      { leg: `${vehicle} → ${buy}`, rate: round(legOut, 8) },
    ],
    lines,
    infraTotalBCCT: round(infraTotalBCCT, 6),
    commonBCCT: round(commonForUsd, 6),
    allInBCCT: round(allInBCCT, 6),
    allInBps: baseBCCT > 0 ? round(((allInBCCT - baseBCCT) / baseBCCT) * 1e4, 3) : null,
    infraBps: baseBCCT > 0 ? round((infraTotalBCCT / baseBCCT) * 1e4, 3) : null,
    note: `Two conversions, two spreads, two unmargined bank exposures and an extra settlement day. The ${vehicle} leg is charged even though its issuer is not a party to the trade.`,
    caveat: 'Principal and correspondent risk are priced as EXPECTED loss. Herstatt-type settlement risk is a tail and systemic exposure, so this understates it; the figure is not inflated to compensate.',
  };
}

/** Price a book of invoices and summarise. */
export function priceBook(trades, ctx) {
  const priced = (trades || []).map((t) => {
    const r = priceInvoice(t, ctx);
    return r.error ? { tradeId: t.id ?? null, error: r.error } : r;
  });
  const ok = priced.filter((p) => !p.error);
  const failed = priced.filter((p) => p.error);
  if (!ok.length) return { priced, summary: null, failed };

  const byLine = {};
  for (const p of ok) for (const l of p.lines) {
    if (l.key === 'base') continue;
    byLine[l.key] ||= { key: l.key, label: l.label, section: l.section, totalBCCT: 0, bpsWeighted: 0 };
    byLine[l.key].totalBCCT += l.amountBCCT;
  }
  const totalBase = sum(ok.map((p) => p.base.bcct));
  for (const k of Object.keys(byLine)) {
    byLine[k].totalBCCT = round(byLine[k].totalBCCT, 6);
    byLine[k].bpsOfBook = totalBase > 0 ? round((byLine[k].totalBCCT / totalBase) * 1e4, 3) : null;
  }
  const savings = ok.filter((p) => p.comparison && !p.comparison.unavailable);

  return {
    priced,
    failed,
    summary: {
      n: ok.length,
      nFailed: failed.length,
      totalBaseBCCT: round(totalBase, 4),
      totalInvoiceBCCT: round(sum(ok.map((p) => p.invoicePrice.bcct)), 4),
      weightedSpreadBps: totalBase > 0 ? round(((sum(ok.map((p) => p.invoicePrice.bcct)) - totalBase) / totalBase) * 1e4, 3) : null,
      components: Object.values(byLine).sort((a, b) => Math.abs(b.totalBCCT) - Math.abs(a.totalBCCT)),
      usdComparison: savings.length ? {
        n: savings.length,
        cheaperDirect: savings.filter((p) => p.comparison.cheaperRoute === 'BCC-T direct').length,
        cheaperUsd: savings.filter((p) => p.comparison.cheaperRoute === 'USD-intermediated').length,
        medianSavingBps: (() => { const v = savings.map((p) => p.comparison.savingBps).sort((a, b) => a - b); return round(v[Math.floor(v.length / 2)], 2); })(),
      } : null,
    },
  };
}

/**
 * §28 adoption cost, for the network-effects view:
 *   ExpectedCost_f(c) = Hedge + Settlement + Liquidity + Operational - lambda*NetworkUse
 */
export function adoptionCost(options, lambda = 1.0) {
  const rows = (options || []).map((o) => {
    const gross = num(o.hedgeCost, 0) + num(o.settlementCost, 0) + num(o.liquidityCost, 0) + num(o.operationalCost, 0);
    const net = gross - lambda * num(o.networkUse, 0);
    return { currency: o.currency, grossCost: round(gross, 6), networkCredit: round(lambda * num(o.networkUse, 0), 6), expectedCost: round(net, 6), ...o };
  }).sort((a, b) => a.expectedCost - b.expectedCost);
  const chosen = rows[0];
  const cheapestGross = [...rows].sort((a, b) => a.grossCost - b.grossCost)[0];
  return {
    lambda,
    rows,
    chosen: chosen?.currency ?? null,
    cheapestIgnoringNetwork: cheapestGross?.currency ?? null,
    lockIn: chosen && cheapestGross && chosen.currency !== cheapestGross.currency,
    reading: chosen && cheapestGross && chosen.currency !== cheapestGross.currency
      ? `${chosen.currency} is chosen only because of the network credit; ${cheapestGross.currency} is cheaper on fundamentals. This is the multiple-equilibrium trap of §28 — every participant waits for the others to move.`
      : 'The chosen currency is also cheapest before the network term, so no coordination trap is present on these inputs.',
    thresholdNetworkUse: (() => {
      if (!chosen || !cheapestGross || chosen.currency === cheapestGross.currency) return null;
      const gap = chosen.expectedCost - (cheapestGross.grossCost - lambda * num(cheapestGross.networkUse, 0));
      return round(num(cheapestGross.networkUse, 0) + Math.abs(gap) / lambda, 6);
    })(),
  };
}
