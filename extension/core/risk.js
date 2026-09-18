/**
 * risk.js — §22 default waterfall, §24 collateral wrong-way risk,
 *           §25 supervisory credit bands (explicitly NOT a daily formula).
 *
 * §25 is emphatic that CreditLimit_i = Collateral_i * DebtSustainability_i is
 * dangerously procyclical. This module therefore never multiplies collateral by
 * a live score. Sovereign risk moves a participant between four supervisory
 * BANDS, using multi-period averages and hysteresis, and the band sets the
 * treatment.
 */

import { num, clamp, mean, round, sum } from './num.js';

export const BANDS = {
  A: { name: 'A', label: 'Normal limits', marginMultiplier: 1.00, unsecuredCap: 1.00, prefundedOnly: false, pdAnnual: 0.0010 },
  B: { name: 'B', label: 'Enhanced margin', marginMultiplier: 1.35, unsecuredCap: 0.60, prefundedOnly: false, pdAnnual: 0.0050 },
  C: { name: 'C', label: 'Restricted unsecured exposure', marginMultiplier: 1.80, unsecuredCap: 0.15, prefundedOnly: false, pdAnnual: 0.0220 },
  D: { name: 'D', label: 'Prefunded settlement only', marginMultiplier: 2.50, unsecuredCap: 0.00, prefundedOnly: true, pdAnnual: 0.0800 },
};

export const DEFAULT_BAND_POLICY = {
  // Entry thresholds on the smoothed sustainability score (0-100, higher = safer).
  enter: { A: 70, B: 55, C: 40 },     // below C's threshold -> D
  hysteresis: 5,                      // must clear the threshold by this much to upgrade
  lookbackPeriods: 4,                 // §25 "multi-period averages"
  minPeriodsInBandBeforeUpgrade: 2,
  settlementFloorShare: 0.25,         // §25 minimum settlement floor for solvent trade
};

/**
 * Assign a supervisory band from a HISTORY of fiscal-sustainability scores.
 * Downgrades take effect on the smoothed score immediately; upgrades require
 * both a hysteresis margin and a minimum dwell time. Asymmetric on purpose.
 */
export function assignBand(scoreHistory, currentBand = null, policy = {}) {
  const p = { ...DEFAULT_BAND_POLICY, ...policy };
  const hist = (scoreHistory || []).map((v) => num(v, NaN)).filter(Number.isFinite);
  if (!hist.length) {
    return { band: 'D', reason: 'no sustainability history available; default to prefunded settlement rather than assume safety', smoothed: null, ...BANDS.D };
  }
  const window = hist.slice(-p.lookbackPeriods);
  const smoothed = mean(window);
  const rawBand = smoothed >= p.enter.A ? 'A' : smoothed >= p.enter.B ? 'B' : smoothed >= p.enter.C ? 'C' : 'D';

  let band = rawBand;
  let note = null;
  const order = ['D', 'C', 'B', 'A'];
  if (currentBand && order.indexOf(rawBand) > order.indexOf(currentBand)) {
    // proposed upgrade
    const threshold = p.enter[rawBand] ?? -Infinity;
    const cleared = smoothed >= threshold + p.hysteresis;
    const dwell = window.length >= p.minPeriodsInBandBeforeUpgrade;
    if (!cleared || !dwell) {
      band = currentBand;
      note = `Upgrade to ${rawBand} withheld: ${!cleared ? `smoothed score ${round(smoothed, 1)} has not cleared ${threshold} + ${p.hysteresis} hysteresis` : 'minimum dwell time not met'}.`;
    }
  }
  return {
    band,
    ...BANDS[band],
    smoothed: round(smoothed, 3),
    latest: round(hist.at(-1), 3),
    window: window.map((v) => round(v, 2)),
    rawBand,
    note,
    procyclicalityGuard: 'Band assignment uses a multi-period average with upgrade hysteresis. A single bad print cannot cut a participant off (§25).',
  };
}

/**
 * §24 collateral haircut with an explicit wrong-way term.
 *
 *   haircut = base + volatility + liquidity + rho * wrongWayLoading + concentration penalty
 *
 * `rho` is the correlation between the collateral's value and the posting
 * participant's own credit. Own-sovereign collateral is the canonical case.
 */
export const COLLATERAL_CLASSES = {
  centralBankDeposit:   { base: 0.000, vol: 0.000, liq: 0.000, label: 'Participating central-bank deposit' },
  ownSovereignShort:    { base: 0.015, vol: 0.010, liq: 0.005, label: 'Own sovereign, < 2y' },
  ownSovereignLong:     { base: 0.040, vol: 0.035, liq: 0.015, label: 'Own sovereign, > 2y' },
  peerSovereign:        { base: 0.025, vol: 0.020, liq: 0.015, label: 'Other participating sovereign' },
  ndbSecurity:          { base: 0.020, vol: 0.015, liq: 0.020, label: 'NDB security' },
  corporateIG:          { base: 0.080, vol: 0.040, liq: 0.045, label: 'Investment-grade corporate' },
  equity:               { base: 0.200, vol: 0.100, liq: 0.060, label: 'Listed equity' },
};

export const DEFAULT_COLLATERAL_POLICY = {
  wrongWayLoading: 0.35,          // max additional haircut at rho = 1
  ownSovereignConcentrationCap: 0.40,
  singleIssuerCap: 0.50,
  concentrationPenalty: 0.60,     // haircut added per unit of excess concentration
  minDiversifiedClasses: 2,
  stressMultiplier: 1.5,
};

export function haircut(item, policy = {}) {
  const p = { ...DEFAULT_COLLATERAL_POLICY, ...policy };
  const cls = COLLATERAL_CLASSES[item.class] || COLLATERAL_CLASSES.corporateIG;
  const rho = clamp(num(item.correlationWithParticipant, item.class?.startsWith('ownSovereign') ? 0.75 : 0.1), -1, 1);
  const base = cls.base + cls.vol + cls.liq;
  const wrongWay = Math.max(0, rho) * p.wrongWayLoading;
  const h = clamp(base + wrongWay, 0, 0.95);
  return {
    class: item.class, label: cls.label,
    marketValue: num(item.marketValue, 0),
    baseHaircut: round(base, 5),
    wrongWayAddon: round(wrongWay, 5),
    correlationWithParticipant: rho,
    haircut: round(h, 5),
    collateralValue: round(num(item.marketValue, 0) * (1 - h), 4),
    stressedCollateralValue: round(num(item.marketValue, 0) * (1 - clamp(base * p.stressMultiplier + wrongWay, 0, 0.98)), 4),
  };
}

/** Value a whole collateral pool and enforce §24 concentration rules. */
export function valueCollateral(items, policy = {}) {
  const p = { ...DEFAULT_COLLATERAL_POLICY, ...policy };
  const rows = (items || []).map((i) => haircut(i, p));
  const gross = sum(rows.map((r) => r.marketValue));
  if (!(gross > 0)) return { error: 'no collateral posted', gross: 0, eligibleValue: 0, rows: [], breaches: ['no collateral'] };

  const breaches = [];
  const ownSov = sum(rows.filter((r) => String(r.class).startsWith('ownSovereign')).map((r) => r.marketValue)) / gross;
  if (ownSov > p.ownSovereignConcentrationCap) breaches.push(`own-sovereign concentration ${(ownSov * 100).toFixed(1)}% exceeds the ${(p.ownSovereignConcentrationCap * 100).toFixed(0)}% cap (§24)`);

  const byIssuer = {};
  for (const i of items) byIssuer[i.issuer || i.class] = (byIssuer[i.issuer || i.class] || 0) + num(i.marketValue, 0);
  for (const [iss, v] of Object.entries(byIssuer)) if (v / gross > p.singleIssuerCap) breaches.push(`single-issuer concentration ${(100 * v / gross).toFixed(1)}% for ${iss} exceeds the ${(p.singleIssuerCap * 100).toFixed(0)}% cap`);

  const classes = new Set(rows.map((r) => r.class));
  if (classes.size < p.minDiversifiedClasses) breaches.push(`only ${classes.size} collateral class(es); minimum diversification is ${p.minDiversifiedClasses}`);

  let eligible = sum(rows.map((r) => r.collateralValue));
  const excess = Math.max(0, ownSov - p.ownSovereignConcentrationCap);
  const penalty = excess * p.concentrationPenalty * gross;
  eligible = Math.max(0, eligible - penalty);

  const wwWeighted = sum(rows.map((r) => r.wrongWayAddon * r.marketValue)) / gross;

  return {
    gross: round(gross, 4),
    eligibleValue: round(eligible, 4),
    /** Value-weighted §24 correlation loading ONLY. Concentration penalties are
     *  deliberately excluded: those restrict credit capacity (see creditCapacity),
     *  they are not a per-transaction charge, and counting them twice was wrong. */
    wrongWayAddon: round(wwWeighted, 5),
    stressedValue: round(sum(rows.map((r) => r.stressedCollateralValue)) - penalty, 4),
    effectiveHaircut: round(1 - eligible / gross, 5),
    ownSovereignShare: round(ownSov, 4),
    concentrationPenalty: round(penalty, 4),
    breaches,
    rows: rows.sort((a, b) => b.marketValue - a.marketValue),
    wrongWayNote: 'Own-sovereign collateral is not excluded (§24 rejects that). It is haircut for the correlation between its value and the poster\'s own credit.',
  };
}

/**
 * Credit capacity — band-driven, NOT score-multiplied.
 * The §25 settlement floor is preserved so that a solvent trade transaction is
 * not blocked outright by a band downgrade.
 */
export function creditCapacity({ collateral, bandInfo, requestedExposure, policy = {} }) {
  const p = { ...DEFAULT_BAND_POLICY, ...policy };
  const b = BANDS[bandInfo.band] || BANDS.D;
  const secured = collateral.eligibleValue / b.marginMultiplier;
  const unsecured = b.prefundedOnly ? 0 : secured * b.unsecuredCap;
  const capacity = secured + unsecured;
  const floor = p.settlementFloorShare * (requestedExposure || 0);
  const granted = Math.min(requestedExposure ?? capacity, Math.max(capacity, b.prefundedOnly ? 0 : floor));

  return {
    band: b.name,
    bandLabel: b.label,
    marginMultiplier: b.marginMultiplier,
    eligibleCollateral: collateral.eligibleValue,
    securedCapacity: round(secured, 4),
    unsecuredCapacity: round(unsecured, 4),
    totalCapacity: round(capacity, 4),
    requestedExposure: requestedExposure ?? null,
    grantedExposure: round(granted, 4),
    shortfall: round(Math.max(0, (requestedExposure ?? 0) - granted), 4),
    usedSettlementFloor: !b.prefundedOnly && capacity < floor,
    prefundedOnly: b.prefundedOnly,
    note: b.prefundedOnly
      ? 'Band D: no clearing credit. The participant prefunds. Trade is not blocked, it is simply not financed by the system.'
      : capacity < (requestedExposure ?? 0)
        ? 'Requested exposure exceeds capacity. The §25 emergency facility requires strong collateral and collective approval; it is not automatic.'
        : null,
  };
}

/** §22 default waterfall, run against an actual loss. */
export function defaultWaterfall({ loss, defaulter, bcccCapital = 0, defaultFund = 0, assessmentCap = 0, survivors = [] }) {
  const layers = [
    { name: 'Defaulter variation margin', available: num(defaulter.variationMargin, 0), mutualised: false },
    { name: 'Defaulter initial margin', available: num(defaulter.initialMargin, 0), mutualised: false },
    { name: 'Defaulter pledged collateral', available: num(defaulter.pledgedCollateral, 0), mutualised: false },
    { name: 'Defaulter default-fund contribution', available: num(defaulter.defaultFundContribution, 0), mutualised: false },
    { name: 'BCCC capital ("skin in the game")', available: num(bcccCapital, 0), mutualised: false },
    { name: 'Mutualised default fund', available: num(defaultFund, 0), mutualised: true },
    { name: 'Capped participant assessments', available: num(assessmentCap, 0), mutualised: true },
  ];
  let remaining = num(loss, 0);
  const applied = layers.map((l) => {
    const used = Math.min(l.available, Math.max(0, remaining));
    remaining -= used;
    return { ...l, used: round(used, 4), exhausted: used >= l.available - 1e-9 && l.available > 0, remainingAfter: round(Math.max(0, remaining), 4) };
  });
  const mutualisedLoss = sum(applied.filter((l) => l.mutualised).map((l) => l.used));
  const perSurvivor = survivors.length
    ? survivors.map((s) => ({ participant: s.participant ?? s, share: round(mutualisedLoss * (num(s.share, 1 / survivors.length)), 4) }))
    : null;

  return {
    loss: round(num(loss, 0), 4),
    layers: applied,
    absorbed: round(num(loss, 0) - Math.max(0, remaining), 4),
    uncovered: round(Math.max(0, remaining), 4),
    mutualisedLoss: round(mutualisedLoss, 4),
    defaulterPaysFirst: round(sum(applied.slice(0, 4).map((l) => l.used)), 4),
    perSurvivor,
    resolutionRequired: remaining > 1e-9,
    verdict: remaining > 1e-9
      ? `Waterfall exhausted with ${round(remaining, 2)} uncovered. Recovery and resolution tools are engaged (§22 layer 8).`
      : 'Loss fully absorbed within the prefunded waterfall.',
    legalNote: 'A sovereign or central-bank failure to perform raises different legal questions from a commercial-bank insolvency and needs separate contractual provisions (§22).',
  };
}

/** §21 — netting is worth nothing if it does not survive insolvency. */
export const LEGAL_OPINION_CHECKLIST = [
  'enforceability of multilateral netting',
  'settlement finality',
  'collateral security interests',
  'insolvency treatment',
  'resolution stays',
  'recognition of foreign clearing rules',
  'conflict-of-law questions',
];

export function legalReadiness(jurisdictions) {
  const rows = (jurisdictions || []).map((j) => {
    const missing = LEGAL_OPINION_CHECKLIST.filter((k) => !j.opinions?.[k]);
    return {
      jurisdiction: j.jurisdiction ?? j.code,
      satisfied: LEGAL_OPINION_CHECKLIST.length - missing.length,
      of: LEGAL_OPINION_CHECKLIST.length,
      missing,
      phaseIIIEligible: missing.length === 0,
    };
  });
  return {
    rows,
    eligible: rows.filter((r) => r.phaseIIIEligible).map((r) => r.jurisdiction),
    blocked: rows.filter((r) => !r.phaseIIIEligible).map((r) => r.jurisdiction),
    rule: 'Phase III clearing must not begin in a jurisdiction until every item is satisfied (§21).',
  };
}
