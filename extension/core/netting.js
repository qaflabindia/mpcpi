/**
 * netting.js — §19, §20 and §27.
 *
 * The identities here are accounting compression, nothing more. §19 is explicit:
 * they "do not prove that actual BRICS trade would produce large liquidity
 * savings". This module therefore reports the compression AND the residual
 * creditor concentration and persistence, which §20 identifies as the variables
 * that actually decide whether the design works.
 */

import { num, sum, mean, sd, round, autocorr1, clamp } from './num.js';

/**
 * @param {Array} obligations [{from, to, amount, currency?}] — `from` OWES `to`.
 * @param {Object} opts {fixing, basket, numeraire:'BCCT'|<code>} to convert mixed currencies.
 */
export function netPeriod(obligations, opts = {}) {
  const { fixing = null, basket = null, numeraire = 'BCCT' } = opts;

  const toNumeraire = (amount, ccy) => {
    const a = num(amount, NaN);
    if (!Number.isFinite(a)) return NaN;
    if (!ccy || !fixing?.ok) return a;
    const code = String(ccy).toUpperCase();
    if (numeraire === 'BCCT') {
      if (!basket) return NaN;
      // value of one BCC-T in `code`, then amount / that
      let v = 0;
      for (const [c, q] of Object.entries(basket.quantities)) {
        const r = fixing.rate(c, code);
        if (!Number.isFinite(r)) return NaN;
        v += q * r;
      }
      return v > 0 ? a / v : NaN;
    }
    const r = fixing.rate(code, String(numeraire).toUpperCase());
    return Number.isFinite(r) ? a * r : NaN;
  };

  const participants = new Set();
  const bilateral = new Map();     // "A|B" -> amount A owes B
  const unconverted = [];
  let gross = 0;

  for (const o of obligations || []) {
    const from = String(o.from || o.payer || o.debtor || '').trim().toUpperCase();
    const to = String(o.to || o.payee || o.creditor || '').trim().toUpperCase();
    if (!from || !to || from === to) continue;
    const amt = toNumeraire(o.amount ?? o.value ?? o.notional, o.currency ?? o.ccy);
    if (!Number.isFinite(amt) || amt <= 0) { unconverted.push(o); continue; }
    participants.add(from); participants.add(to);
    const k = `${from}|${to}`;
    bilateral.set(k, (bilateral.get(k) || 0) + amt);
    gross += amt;
  }

  const codes = [...participants].sort();
  const net = Object.fromEntries(codes.map((c) => [c, 0]));
  for (const [k, v] of bilateral) {
    const [a, b] = k.split('|');
    net[a] -= v; net[b] += v;
  }

  // §19 bilateral-netting-only benchmark, for the marginal value of going multilateral.
  let bilateralNet = 0;
  const seenPair = new Set();
  for (const [k] of bilateral) {
    const [a, b] = k.split('|');
    const pk = [a, b].sort().join('~');
    if (seenPair.has(pk)) continue;
    seenPair.add(pk);
    bilateralNet += Math.abs((bilateral.get(`${a}|${b}`) || 0) - (bilateral.get(`${b}|${a}`) || 0));
  }

  const netSettlement = 0.5 * sum(codes.map((c) => Math.abs(net[c])));
  const imbalance = sum(codes.map((c) => net[c]));

  const positions = codes.map((c) => ({
    participant: c,
    netPosition: round(net[c], 6),
    side: net[c] > 1e-9 ? 'creditor' : net[c] < -1e-9 ? 'debtor' : 'flat',
    grossPayable: round(sum([...bilateral].filter(([k]) => k.startsWith(`${c}|`)).map(([, v]) => v)), 6),
    grossReceivable: round(sum([...bilateral].filter(([k]) => k.endsWith(`|${c}`)).map(([, v]) => v)), 6),
  })).sort((a, b) => b.netPosition - a.netPosition);

  const creditors = positions.filter((p) => p.side === 'creditor');
  const absNet = codes.map((c) => Math.abs(net[c]));
  const totalAbs = sum(absNet) || 1;
  const herfindahl = sum(absNet.map((a) => (a / totalAbs) ** 2));

  return {
    numeraire,
    participants: codes,
    bilateralMatrix: Object.fromEntries([...bilateral].map(([k, v]) => [k.replace('|', '→'), round(v, 6)])),
    grossSettlement: round(gross, 6),
    bilateralNetSettlement: round(bilateralNet, 6),
    netSettlement: round(netSettlement, 6),
    liquiditySaving: round(gross - netSettlement, 6),
    liquiditySavingPercent: gross > 0 ? round(100 * (gross - netSettlement) / gross, 4) : null,
    multilateralGainOverBilateral: bilateralNet > 0 ? round(100 * (bilateralNet - netSettlement) / bilateralNet, 4) : null,
    positions,
    zeroSumCheck: { sumOfNetPositions: round(imbalance, 9), ok: Math.abs(imbalance) < 1e-6 * Math.max(1, gross) },
    concentration: {
      herfindahl: round(herfindahl, 5),
      effectiveParticipants: round(1 / herfindahl, 3),
      largestCreditorShare: creditors.length ? round(creditors[0].netPosition / (netSettlement || 1), 4) : null,
      largestCreditor: creditors[0]?.participant ?? null,
      hubRisk: herfindahl > 0.4 ? 'high — residual positions concentrate on one participant, which is exactly the §19 caveat' : herfindahl > 0.25 ? 'moderate' : 'low',
    },
    unconverted: unconverted.length ? { count: unconverted.length, note: 'obligations dropped: no fixing available for their currency' } : null,
    caveat: 'Compression is an accounting identity. It says nothing about whether residual creditor balances are acceptable — see persistence (§20).',
  };
}

/**
 * §20 — the test that actually matters. Runs netPeriod over many periods and
 * measures how large and how PERSISTENT residual creditor balances are.
 */
export function nettingProgramme(periods, opts = {}) {
  const results = periods.map((p) => ({ period: p.period ?? p.label ?? null, ...netPeriod(p.obligations, opts) }));
  const participants = [...new Set(results.flatMap((r) => r.participants))].sort();

  const series = Object.fromEntries(participants.map((c) => [c, results.map((r) => r.positions.find((p) => p.participant === c)?.netPosition ?? 0)]));

  const persistence = participants.map((c) => {
    const s = series[c];
    const m = mean(s);
    const signs = s.map((v) => Math.sign(v));
    const sameSideShare = Math.max(
      signs.filter((v) => v > 0).length,
      signs.filter((v) => v < 0).length,
    ) / s.length;
    const ac1 = autocorr1(s);
    const cumulative = s.reduce((a, b) => a + b, 0);
    return {
      participant: c,
      meanNetPosition: round(m, 4),
      sdNetPosition: round(sd(s), 4),
      lag1Autocorrelation: Number.isFinite(ac1) ? round(ac1, 4) : null,
      sameSideShare: round(sameSideShare, 4),
      cumulativeBalance: round(cumulative, 4),
      classification: sameSideShare > 0.8 && Math.abs(m) > 0.02 * mean(results.map((r) => r.grossSettlement))
        ? (m > 0 ? 'structural creditor' : 'structural debtor')
        : 'oscillating',
      series: s.map((v) => round(v, 4)),
    };
  }).sort((a, b) => b.cumulativeBalance - a.cumulativeBalance);

  const structuralCreditors = persistence.filter((p) => p.classification === 'structural creditor');
  const savings = results.map((r) => r.liquiditySavingPercent).filter(Number.isFinite);

  return {
    periods: results,
    summary: {
      nPeriods: results.length,
      meanLiquiditySavingPercent: savings.length ? round(mean(savings), 3) : null,
      minLiquiditySavingPercent: savings.length ? round(Math.min(...savings), 3) : null,
      maxLiquiditySavingPercent: savings.length ? round(Math.max(...savings), 3) : null,
      meanHerfindahl: round(mean(results.map((r) => r.concentration.herfindahl)), 4),
    },
    persistence,
    verdict: structuralCreditors.length
      ? `${structuralCreditors.map((c) => c.participant).join(', ')} accumulate persistently. The creditor-asset layer of §26 is therefore the binding constraint, not a secondary feature.`
      : 'No structural creditor detected over this sample. Positions oscillate, so the asset layer is less binding — but test more periods and stressed scenarios before relying on that.',
    requiredNext: 'Stress the matrix against commodity, FX and trade-disruption shocks (§20.7) before drawing a conclusion.',
  };
}

/**
 * §27 symmetric adjustment. Charges BOTH persistent debtors and persistent
 * creditors, so the clearing system does not become a warehouse of unusable
 * claims. Parameters are meant to be calibrated from simulation, not chosen
 * politically — the function therefore exposes them rather than hiding them.
 */
export function symmetricAdjustment(persistenceRows, cfg = {}) {
  const {
    quotaBase,                        // reference scale, e.g. mean gross settlement
    debtorTiers = [[0.25, 0.005], [0.50, 0.015], [1.00, 0.035], [Infinity, 0.070]],
    creditorTiers = [[0.25, 0.000], [0.50, 0.005], [1.00, 0.015], [Infinity, 0.030]],
    reinvestmentThreshold = 0.5,
  } = cfg;
  if (!(quotaBase > 0)) return { error: 'quotaBase must be positive' };

  const tierRate = (tiers, x) => { for (const [cap, rate] of tiers) if (x <= cap) return rate; return tiers.at(-1)[1]; };

  return {
    quotaBase: round(quotaBase, 4),
    rows: persistenceRows.map((p) => {
      const ratio = Math.abs(p.cumulativeBalance) / quotaBase;
      const isCreditor = p.cumulativeBalance > 0;
      const rate = isCreditor ? tierRate(creditorTiers, ratio) : tierRate(debtorTiers, ratio);
      return {
        participant: p.participant,
        side: isCreditor ? 'creditor' : 'debtor',
        cumulativeBalance: p.cumulativeBalance,
        quotaRatio: round(ratio, 4),
        annualCharge: round(rate, 5),
        chargeAmount: round(rate * Math.abs(p.cumulativeBalance), 4),
        mandatoryReinvestment: isCreditor && ratio > reinvestmentThreshold,
        note: isCreditor && ratio > reinvestmentThreshold
          ? 'Above threshold: balance must be deployed into the §26 asset layer rather than held idle.'
          : null,
      };
    }),
    rationale: 'Not a penalty on successful exporters (§27). The objective is to stop the system accumulating claims nobody can use.',
    calibrationWarning: 'These tiers are placeholders. §27 requires them to be estimated from trade-flow simulation.',
  };
}

/** §20.7 — shock the matrix and re-run. */
export function stressNetting(obligations, scenarios, opts = {}) {
  const baseline = netPeriod(obligations, opts);
  const runs = scenarios.map((sc) => {
    const shocked = (obligations || []).map((o) => {
      let amt = num(o.amount ?? o.value, 0);
      const from = String(o.from || '').toUpperCase(), to = String(o.to || '').toUpperCase();
      if (sc.participantShock) for (const [p, mult] of Object.entries(sc.participantShock)) {
        if (from === p.toUpperCase() || to === p.toUpperCase()) amt *= mult;
      }
      if (sc.commodityShock && o.sector && sc.commodityShock[o.sector]) amt *= sc.commodityShock[o.sector];
      if (sc.globalShock) amt *= sc.globalShock;
      return { ...o, amount: amt };
    });
    const r = netPeriod(shocked, opts);
    return {
      scenario: sc.name,
      description: sc.description ?? null,
      liquiditySavingPercent: r.liquiditySavingPercent,
      netSettlement: r.netSettlement,
      deltaVsBaselinePct: baseline.netSettlement > 0 ? round(100 * (r.netSettlement - baseline.netSettlement) / baseline.netSettlement, 3) : null,
      herfindahl: r.concentration.herfindahl,
      hubRisk: r.concentration.hubRisk,
      largestCreditor: r.concentration.largestCreditor,
    };
  });
  return { baseline: { liquiditySavingPercent: baseline.liquiditySavingPercent, netSettlement: baseline.netSettlement, herfindahl: baseline.concentration.herfindahl }, runs };
}
