/**
 * pipeline.js — one function that turns validated tables into every result the
 * UI and the agent need. Pure: no DOM, no network, no storage.
 *
 * Order matters and follows the paper: fix rates (§8) -> constitute the basket
 * (§6) -> score diagnostics (§10-§16) -> assign supervisory bands (§25) ->
 * net obligations (§19) -> price invoices. Diagnostics feed bands and pricing;
 * they never feed the basket (§4).
 */

import { runFixing, verifyConsistency } from './fx-fixing.js';
import { buildBasket, valueIn, strengthIndex, weightDrift, selfReferenceAttenuation, bcctQuotes } from './basket.js';
import { currencyHealth, currencyPower, excessUsage, mandatoryDollarDependency } from './diagnostics.js';
import { scoreObservation, composite, INDICATORS } from './metrics.js';
import { assignBand, valueCollateral, creditCapacity, legalReadiness, LEGAL_OPINION_CHECKLIST } from './risk.js';
import { netPeriod, nettingProgramme, symmetricAdjustment } from './netting.js';
import { priceBook } from './invoice.js';
import { num, round, mean } from './num.js';

export const DEFAULT_CONFIG = {
  anchor: null,               // defaults to the largest-weight currency
  maximumWeight: 0.25,
  numeraire: 'BCCT',
  tauDays: 90,
  confidenceLevel: 0.95,
  clearingFeeBps: 1.5,
  nettingRebateShare: 0.5,
  currencyFixedEffects: false,
  pricing: {},
};

const upper = (x) => String(x ?? '').trim().toUpperCase();

/**
 * Group rows by a key, MERGING fields across rows rather than letting the last
 * row win. A sheet may legitimately spread one participant over several lines —
 * three collateral holdings, say — with the band history stated only once.
 * Taking the last row would silently discard it.
 */
function indexBy(rows, key) {
  const m = {};
  for (const r of rows || []) {
    const k = upper(r[key]);
    if (!k) continue;
    if (!m[k]) { m[k] = { ...r }; continue; }
    for (const [f, v] of Object.entries(r)) {
      if (v === null || v === undefined || v === '') continue;
      if (m[k][f] === null || m[k][f] === undefined || m[k][f] === '') m[k][f] = v;
    }
  }
  return m;
}

export function analyze(tables, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const warnings = [], blocking = [];
  const t = tables || {};

  /* ── 1. Fixing (§8) ──────────────────────────────────────────────────── */
  const declaredCcys = (t.currencies || []).map((c) => upper(c.code)).filter(Boolean);
  // The Currencies sheet IS the participating network. Anything else appearing
  // in the quotes — USD above all — is external and may not influence the
  // internal matrix (§37).
  const fixing = runFixing(t.fx_quotes || [], {
    currencies: declaredCcys,
    participants: declaredCcys,
    policy: cfg.fixingPolicy,
  });
  if (!fixing.ok) blocking.push(`FX fixing failed: ${fixing.reason}. Nothing downstream can be computed (§9 disruption).`);
  else warnings.push(...(fixing.warnings || []));
  const consistency = fixing.ok ? verifyConsistency(fixing) : null;

  /* ── 2. Basket (§6) ──────────────────────────────────────────────────── */
  let basket = null, basketValues = null, drift = null, selfRef = null, pivot = null;
  if (fixing.ok && (t.currencies || []).length >= 2) {
    const anchor = cfg.anchor
      ? upper(cfg.anchor)
      : [...declaredCcys].filter((c) => fixing.currencies.includes(c))[0];
    basket = buildBasket({
      currencies: t.currencies,
      baseFixing: cfg.baseFixing || fixing,
      anchor,
      config: { maximumWeight: cfg.maximumWeight },
    });
    if (basket.error) {
      // A currency that only ever trades against the vehicle never enters the
      // internal fit, so it has no internal price and cannot join the basket.
      // Say that, rather than reporting a missing rate as if it were a typo.
      const orphaned = declaredCcys.filter((c) => fixing.ok && !(fixing.participants || []).includes(c));
      const extra = orphaned.length
        ? ` ${orphaned.join(', ')} ${orphaned.length === 1 ? 'is' : 'are'} quoted only against currencies outside the participating network, so ${orphaned.length === 1 ? 'it has' : 'they have'} no price inside it. Add at least one direct quote against a participating currency.`
        : '';
      blocking.push(`Basket: ${basket.error}.${extra}`);
      basket = null;
    }
    else {
      warnings.push(...(basket.issues || []));
      basketValues = Object.fromEntries(
        fixing.currencies.map((c) => [c, valueIn(basket, fixing, c)]).filter(([, v]) => !v.error),
      );
      drift = weightDrift(basket, fixing);
      selfRef = basket.components.map((c) => ({ code: c.code, ...selfReferenceAttenuation(c.finalWeight) }));
      pivot = bcctQuotes(basket, fixing);
      if (pivot.error) { warnings.push(`BCC-T quotation unavailable: ${pivot.error}`); pivot = null; }
      else if (!pivot.reconstruction.lossless) {
        warnings.push(`Re-anchoring to BCC-T does not reproduce the fitted bilaterals (worst ${pivot.reconstruction.worstPair}, ${pivot.reconstruction.maxErrorBps} bps). Treat the published matrix with suspicion.`);
      }
    }
  } else if (fixing.ok) {
    blocking.push('At least two currencies with basket inputs are required to constitute BCC-T (§6).');
  }

  /* ── 3. Diagnostics (§10-§16) ────────────────────────────────────────── */
  const fundamentals = indexBy(t.fundamentals, 'participant');
  const leading = indexBy(t.leading, 'participant');
  const usageRows = t.usage || [];
  const participantSet = new Set([
    ...Object.keys(fundamentals), ...Object.keys(leading),
    ...(t.participants || []).map((p) => upper(p.participant)),
    ...(t.trades || []).flatMap((x) => [upper(x.exporter), upper(x.importer)]),
  ].filter(Boolean));

  const participantsCfg = indexBy(t.participants, 'participant');
  const collateralByParticipant = {};
  for (const row of t.participants || []) {
    const p = upper(row.participant);
    if (!p || !row.collateralValue) continue;
    (collateralByParticipant[p] ||= []).push({
      class: row.collateralClass || 'peerSovereign',
      issuer: row.collateralIssuer || p,
      marketValue: num(row.collateralValue, 0),
    });
  }

  const usageByCcy = {};
  for (const u of usageRows) {
    const c = upper(u.currency);
    if (c) (usageByCcy[c] ||= []).push(u);
  }

  const diagnostics = [];
  let diagnosticsCoverage = null;
  for (const p of [...participantSet].sort()) {
    const obs = { ...(fundamentals[p] || {}), ...(leading[p] || {}) };
    const hasAny = Object.keys(INDICATORS).some((k) => obs[k] !== undefined && obs[k] !== null);
    const health = hasAny ? currencyHealth(obs) : null;
    const scored = hasAny ? scoreObservation(obs) : null;
    const comp = scored ? composite(scored, cfg.defaultHorizonDays ?? 30, cfg.tauDays) : null;

    const histRaw = participantsCfg[p]?.sustainabilityHistory;
    const hist = Array.isArray(histRaw) && histRaw.length
      ? histRaw
      : (health?.blocks?.fiscalSustainability?.score != null ? [health.blocks.fiscalSustainability.score] : []);
    const band = assignBand(hist, participantsCfg[p]?.currentBand ? upper(participantsCfg[p].currentBand) : null);
    if (hist.length === 1) warnings.push(`${p}: only one fiscal-sustainability observation available, so the §25 multi-period average degenerates to a single print. Supply sustainabilityHistory in the Participants sheet.`);

    const collateral = collateralByParticipant[p]?.length ? valueCollateral(collateralByParticipant[p]) : null;

    // Currency power is per-CURRENCY; attach it when the participant maps to one.
    const ccy = (t.currencies || []).find((c) => upper(c.country) === p || upper(c.code) === p);
    const uRows = ccy ? usageByCcy[upper(ccy.code)] : usageByCcy[p];
    const power = uRows?.length ? currencyPower(uRows[uRows.length - 1]) : null;

    diagnostics.push({ participant: p, currency: ccy ? upper(ccy.code) : null, health, scored, composite: comp, band, collateral, power });
  }

  // An indicator absent for every participant means the workbook has no such
  // column at all. That is a different fact from one country failing to report,
  // and it is the one worth telling the user, because no amount of per-country
  // chasing will fix it.
  if (diagnostics.length) {
    const scoredRows = diagnostics.filter((d) => d.scored);
    if (scoredRows.length) {
      const absent = [];
      for (const key of Object.keys(INDICATORS)) {
        const present = scoredRows.filter((d) => d.scored.rows.find((r) => r.key === key && !r.missing)).length;
        if (present === 0) absent.push(key);
      }
      if (absent.length) {
        const byBlock = { leading: [], lagging: [] };
        for (const k of absent) byBlock[INDICATORS[k].block].push(k);
        for (const [block, keys] of Object.entries(byBlock)) {
          if (!keys.length) continue;
          warnings.push(`${keys.length} ${block} indicator(s) are absent for every participant, so the column is missing from the workbook rather than one country under-reporting: ${keys.join(', ')}. The ${block} index is computed from the remainder and its coverage flag reflects that.`);
        }
      }
      diagnosticsCoverage = {
        absentEverywhere: absent,
        perBlock: Object.fromEntries(['leading', 'lagging'].map((b) => {
          const all = Object.keys(INDICATORS).filter((k) => INDICATORS[k].block === b);
          return [b, { of: all.length, absentEverywhere: absent.filter((k) => INDICATORS[k].block === b).length }];
        })),
      };
    }
  }

  /* ── 4. Excess usage (§16) ───────────────────────────────────────────── */
  let excess = null;
  if (usageRows.length >= 6) {
    const chsByCcy = {};
    for (const d of diagnostics) if (d.currency && d.health?.chs != null) chsByCcy[d.currency] = d.health.chs;
    const panel = usageRows.map((u) => {
      const c = upper(u.currency);
      const cps = currencyPower(u).cps;
      return { currency: c, year: u.year ?? 'NA', cps, chs: chsByCcy[c] ?? null, marketDepth: num(u.marketDepth, NaN), tradeScale: num(u.tradeScale, NaN) };
    }).filter((r) => r.cps != null && r.chs != null && Number.isFinite(r.marketDepth) && Number.isFinite(r.tradeScale));
    excess = panel.length >= 6 ? excessUsage(panel, { currencyFixedEffects: cfg.currencyFixedEffects }) : { error: `only ${panel.length} complete currency-year observations after joining usage to CHS; §16 needs at least 6`, usable: panel.length };
    if (excess.error) warnings.push(`Excess-usage regression not run: ${excess.error}`);
  }

  /* ── 5. Netting (§19-§20) ────────────────────────────────────────────── */
  let netting = null, programme = null, adjustment = null;
  const obligations = t.obligations || [];
  if (obligations.length) {
    const periods = [...new Set(obligations.map((o) => o.period ?? 'single'))];
    const nOpts = { fixing: fixing.ok ? fixing : null, basket, numeraire: cfg.numeraire };
    if (periods.length > 1) {
      programme = nettingProgramme(periods.map((p) => ({ period: p, obligations: obligations.filter((o) => (o.period ?? 'single') === p) })), nOpts);
      netting = programme.periods.at(-1);
      const base = mean(programme.periods.map((x) => x.grossSettlement));
      if (base > 0) adjustment = symmetricAdjustment(programme.persistence, { quotaBase: base });
    } else {
      netting = netPeriod(obligations, nOpts);
    }
    if (netting?.unconverted) warnings.push(`${netting.unconverted.count} obligation(s) could not be converted to ${cfg.numeraire} and were excluded.`);
  }

  const realisedNetting = programme
    ? (programme.summary.meanLiquiditySavingPercent ?? 0) / 100
    : netting ? (netting.liquiditySavingPercent ?? 0) / 100 : 0;

  /* ── 6. Invoices ─────────────────────────────────────────────────────── */
  let book = null;
  if (fixing.ok && basket && (t.trades || []).length) {
    const rates = {}, vols = {};
    for (const c of t.currencies || []) {
      const code = upper(c.code);
      if (Number.isFinite(num(c.policyRate, NaN))) rates[code] = num(c.policyRate);
      if (Number.isFinite(num(c.annualVol, NaN))) vols[code] = num(c.annualVol);
    }
    for (const d of diagnostics) {
      if (d.currency && d.scored) {
        const v = d.scored.rows.find((r) => r.key === 'fxVol20d');
        if (v && !v.missing && vols[d.currency] === undefined) vols[d.currency] = v.value;
      }
    }
    const bands = {}, collateral = {}, metricsByP = {};
    for (const d of diagnostics) {
      bands[d.participant] = d.band;
      if (d.currency) bands[d.currency] = d.band;
      if (d.collateral) { collateral[d.participant] = d.collateral; if (d.currency) collateral[d.currency] = d.collateral; }
      const obs = { ...(fundamentals[d.participant] || {}), ...(leading[d.participant] || {}) };
      if (Object.keys(obs).length) { metricsByP[d.participant] = obs; if (d.currency) metricsByP[d.currency] = obs; }
    }
    book = priceBook(t.trades, {
      fixing, basket, rates, vols,
      correlations: cfg.correlations || {},
      bands, collateral, metrics: metricsByP,
      nettingEfficiency: realisedNetting,
      config: { tauDays: cfg.tauDays, confidenceLevel: cfg.confidenceLevel, clearingFeeBps: cfg.clearingFeeBps, nettingRebateShare: cfg.nettingRebateShare, ...cfg.pricing },
    });
    if (book.failed?.length) warnings.push(`${book.failed.length} trade(s) could not be priced: ${book.failed.map((f) => `${f.tradeId}: ${f.error}`).slice(0, 3).join('; ')}`);
  } else if (fixing.ok && !(t.trades || []).length) {
    warnings.push('No trades supplied, so no invoice was priced. Add a Trades sheet.');
  }

  /* ── 7. Legal readiness (§21) and dependency (§37) ───────────────────── */
  const legal = (t.participants || []).length
    ? legalReadiness((t.participants || []).map((p) => ({
      jurisdiction: upper(p.participant),
      opinions: Object.fromEntries(LEGAL_OPINION_CHECKLIST.map((k) => [
        k,
        k === 'enforceability of multilateral netting' ? !!p.nettingOpinion
          : k === 'settlement finality' ? !!p.settlementFinality
            : !!p.nettingOpinion && !!p.settlementFinality,
      ])),
    })))
    : null;

  /**
   * §37, tested rather than asserted.
   *
   * These flags previously passed as long as two non-dollar currencies existed
   * anywhere in the fixing, which was true even when every published cross rate
   * had been determined by the dollar legs. Each one now checks the thing it
   * claims.
   */
  const vehicle = upper(cfg.vehicleCurrency || 'USD');
  const participants = fixing.ok ? (fixing.participants || []) : [];

  // Measurement: was the internal matrix estimated without a single external quote?
  const measurementIndependent = !!(fixing.ok && fixing.internalMatrixIsVehicleFree && participants.length >= 2);

  // BridgeFX: can EVERY participating pair be converted without transiting the
  // vehicle? One unreachable pair means the network still needs the bridge.
  let bridgeIndependent = false, unreachablePairs = [];
  if (fixing.ok && typeof fixing.conversionPath === 'function' && participants.length >= 2) {
    for (const a of participants) for (const b of participants) {
      if (a >= b) continue;
      const path = fixing.conversionPath(a, b, { exclude: [vehicle] });
      if (!Number.isFinite(path.bps)) unreachablePairs.push(`${a}/${b}`);
    }
    bridgeIndependent = unreachablePairs.length === 0;
  }
  if (unreachablePairs.length) {
    warnings.push(`${unreachablePairs.length} participating pair(s) cannot be converted without routing through ${vehicle}: ${unreachablePairs.slice(0, 6).join(', ')}${unreachablePairs.length > 6 ? '…' : ''}. The §37 bridge condition is not met.`);
  }

  // Invoicing: priced in BCC-T, and the numeraire itself reconstructs without the vehicle.
  const invoicingIndependent = !!(basket && book?.summary?.n && pivot?.reconstruction?.lossless);

  const dependency = mandatoryDollarDependency({
    measurement: measurementIndependent,
    invoicing: invoicingIndependent,
    bridgeFx: bridgeIndependent,
    clearing: !!(netting && netting.zeroSumCheck?.ok),
    settlement: !!(legal && legal.eligible.length >= 2),
  });
  dependency.evidence = {
    vehicle,
    internalMatrixFittedFrom: fixing.ok ? `${fixing.diagnostics.internalQuotesUsed} participating quotes; ${fixing.diagnostics.externalQuotesUsed} external quotes used only to price satellites` : null,
    externalSatellites: fixing.ok ? fixing.external : [],
    unreachableWithoutVehicle: unreachablePairs,
    numeraireReconstructsLosslessly: pivot?.reconstruction?.lossless ?? null,
  };

  /* ── 8. Strength indices (§7) ────────────────────────────────────────── */
  const strength = (basket && cfg.baseFixing && fixing.ok) ? strengthIndex(basket, cfg.baseFixing, fixing) : null;

  return {
    asOf: new Date().toISOString(),
    config: cfg,
    fixing, consistency,
    basket, basketValues, drift, selfReference: selfRef, strength, pivot,
    diagnostics, diagnosticsCoverage, excessUsage: excess,
    netting, programme, adjustment, realisedNetting,
    book, legal, dependency,
    warnings: [...new Set(warnings)],
    blocking,
    ok: blocking.length === 0,
    headline: buildHeadline({ fixing, basket, book, netting, dependency, diagnostics }),
  };
}

/** The numbers a user, and the agent, look at first. */
function buildHeadline({ fixing, basket, book, netting, dependency, diagnostics }) {
  const worst = diagnostics
    .filter((d) => d.composite?.divergence != null)
    .sort((a, b) => a.composite.divergence - b.composite.divergence)[0];

  // The infrastructure difference is the comparison that means something; the
  // all-in figure additionally carries one extra settlement day of FX risk,
  // which on a volatile pair can decide it on its own. Report both, so nothing
  // downstream — the agent included — can mistake one for the other.
  const withDiff = (book?.priced || []).filter((p) => !p.error && p.comparison?.differential);
  const infraDiffs = withDiff.map((p) => p.comparison.differential.infrastructureDifferenceBps).sort((a, b) => a - b);
  const routeComparison = withDiff.length ? {
    medianInfrastructureDifferenceBps: round(infraDiffs[Math.floor(infraDiffs.length / 2)], 3),
    directCheaperOnInfrastructure: `${withDiff.filter((p) => p.comparison.cheaperInfrastructure === 'BCC-T direct').length}/${withDiff.length}`,
    directCheaperAllIn: `${withDiff.filter((p) => p.comparison.cheaperRoute === 'BCC-T direct').length}/${withDiff.length}`,
    verdictsDisagreeOn: withDiff.filter((p) => !p.comparison.differential.verdictsAgree).length,
    medianCommonBlockBps: round(mean(withDiff.map((p) => p.comparison.differential.commonToBothBps)), 1),
    note: 'The common block is interest carry and unhedged FX risk, identical on both routes. It is excluded from the infrastructure comparison because it dwarfs it.',
  } : null;

  return {
    invoiceTotalBCCT: book?.summary?.totalInvoiceBCCT ?? null,
    weightedSpreadBps: book?.summary?.weightedSpreadBps ?? null,
    routeComparison,
    medianSavingVsUsdAllInBps: book?.summary?.usdComparison?.medianSavingBps ?? null,
    liquiditySavingPct: netting?.liquiditySavingPercent ?? null,
    usdIndependentDimensions: `${dependency.independentDimensions}/${dependency.of}`,
    basketCurrencies: basket?.components?.length ?? 0,
    quotesAccepted: fixing?.ok ? fixing.diagnostics.quotesAccepted : 0,
    earliestWarning: worst ? { participant: worst.participant, divergence: worst.composite.divergence, signal: worst.composite.signal } : null,
  };
}
