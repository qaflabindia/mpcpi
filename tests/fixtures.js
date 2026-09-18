/** Deterministic sample dataset used by tests, the sample workbook and the
 *  extension's "Load sample" button. Figures are illustrative, not official. */

export const currencies = [
  { code: 'CNY', name: 'Chinese yuan',       country: 'CN', intraNetworkTradeShare: 0.52, gdpShare: 0.62, fxLiquidity: 0.55, convertibility: 0.45, policyRate: 0.031,  annualVol: 0.045 },
  { code: 'INR', name: 'Indian rupee',       country: 'IN', intraNetworkTradeShare: 0.19, gdpShare: 0.19, fxLiquidity: 0.22, convertibility: 0.55, policyRate: 0.065,  annualVol: 0.052 },
  { code: 'BRL', name: 'Brazilian real',     country: 'BR', intraNetworkTradeShare: 0.13, gdpShare: 0.09, fxLiquidity: 0.14, convertibility: 0.80, policyRate: 0.1075, annualVol: 0.135 },
  { code: 'RUB', name: 'Russian rouble',     country: 'RU', intraNetworkTradeShare: 0.10, gdpShare: 0.07, fxLiquidity: 0.05, convertibility: 0.25, policyRate: 0.16,   annualVol: 0.240 },
  { code: 'ZAR', name: 'South African rand', country: 'ZA', intraNetworkTradeShare: 0.06, gdpShare: 0.03, fxLiquidity: 0.09, convertibility: 0.85, policyRate: 0.0825, annualVol: 0.155 },
];

/**
 * Quote timestamps are generated at load time, a few minutes back, so the
 * sample always looks like a live snapshot. A hard-coded timestamp goes stale
 * within the §9 window and the whole sample then fixes nothing — which is
 * precisely what happened before this was made relative.
 */
const T = new Date(Date.now() - 4 * 60 * 1000).toISOString();
export const fx_quotes = [
  { base: 'CNY', quote: 'INR', rate: 11.4900,  bid: 11.4880, ask: 11.4920, volume: 5.0e6, depth: 2.0e6, venueTier: 1, ts: T },
  { base: 'CNY', quote: 'BRL', rate: 0.74860,  bid: 0.74840, ask: 0.74880, volume: 3.0e6, depth: 1.2e6, venueTier: 1, ts: T },
  { base: 'CNY', quote: 'RUB', rate: 12.7100,  spreadBps: 12, volume: 1.0e6, depth: 4.0e5, venueTier: 2, ts: T },
  { base: 'CNY', quote: 'ZAR', rate: 2.56900,  spreadBps: 10, volume: 1.1e6, depth: 5.0e5, venueTier: 2, ts: T },
  { base: 'INR', quote: 'BRL', rate: 0.065150, spreadBps: 14, volume: 4.0e5, depth: 1.5e5, venueTier: 2, ts: T },
  { base: 'INR', quote: 'ZAR', rate: 0.223600, spreadBps: 16, volume: 3.0e5, depth: 1.0e5, venueTier: 2, ts: T },
  { base: 'BRL', quote: 'ZAR', rate: 3.43200,  spreadBps: 18, volume: 2.0e5, depth: 8.0e4, venueTier: 2, ts: T },
  { base: 'RUB', quote: 'INR', rate: 0.904000, spreadBps: 22, volume: 2.5e5, depth: 9.0e4, venueTier: 2, ts: T },
  { base: 'USD', quote: 'CNY', rate: 7.24000,  bid: 7.2399, ask: 7.2401, volume: 9.0e6, depth: 5.0e6, venueTier: 1, ts: T },
  { base: 'USD', quote: 'INR', rate: 83.2000,  bid: 83.198, ask: 83.202, volume: 8.0e6, depth: 4.0e6, venueTier: 1, ts: T },
  { base: 'USD', quote: 'BRL', rate: 5.42000,  spreadBps: 3,  volume: 6.0e6, depth: 3.0e6, venueTier: 1, ts: T },
  { base: 'USD', quote: 'ZAR', rate: 18.6000,  spreadBps: 6,  volume: 2.0e6, depth: 8.0e5, venueTier: 1, ts: T },
  { base: 'USD', quote: 'RUB', rate: 92.0000,  spreadBps: 30, volume: 5.0e5, depth: 2.0e5, venueTier: 3, ts: T },
  // A deliberate fat finger: the outlier rule of §9 must reject exactly this row.
  { base: 'CNY', quote: 'INR', rate: 14.9000,  spreadBps: 25, volume: 6.0e5, depth: 1.0e5, venueTier: 3, ts: T },
];

export const trades = [
  { id: 'T-001', description: 'Iron ore fines, 50kt',      exporter: 'BR', importer: 'IN', sellerCurrency: 'BRL', buyerCurrency: 'INR', quantity: 50000, unitPrice: 610,    settlementDays: 45, hedgeRatio: 0.40, incoterm: 'CFR', sector: 'metals' },
  { id: 'T-002', description: 'CNC machine tools, 12 sets', exporter: 'CN', importer: 'BR', sellerCurrency: 'CNY', buyerCurrency: 'BRL', quantity: 12,    unitPrice: 485000, settlementDays: 90, hedgeRatio: 0.00, incoterm: 'FOB', sector: 'machinery' },
  { id: 'T-003', description: 'Pharmaceutical APIs',        exporter: 'IN', importer: 'ZA', sellerCurrency: 'INR', buyerCurrency: 'ZAR', quantity: 1,     unitPrice: 41500000, settlementDays: 30, hedgeRatio: 0.75, incoterm: 'CIF', sector: 'pharma' },
  { id: 'T-004', description: 'Crude oil, 1m bbl',          exporter: 'RU', importer: 'CN', sellerCurrency: 'RUB', buyerCurrency: 'CNY', quantity: 1000000, unitPrice: 6450, settlementDays: 7,  hedgeRatio: 0.20, incoterm: 'FOB', sector: 'energy' },
  { id: 'T-005', description: 'Soybeans, 120kt',            exporter: 'BR', importer: 'CN', sellerCurrency: 'BRL', buyerCurrency: 'CNY', quantity: 120000, unitPrice: 2380,  settlementDays: 60, hedgeRatio: 0.50, incoterm: 'FOB', sector: 'agri' },
  { id: 'T-006', description: 'Platinum group metals',      exporter: 'ZA', importer: 'IN', sellerCurrency: 'ZAR', buyerCurrency: 'INR', quantity: 900,   unitPrice: 19800,  settlementDays: 21, hedgeRatio: 0.10, incoterm: 'CIF', sector: 'metals' },
];

export const fundamentals = [
  { participant: 'CN', year: 2026, inflationYoY: 0.008, inflationVol5y: 0.011, debtGdp: 0.88, interestRevenue: 0.09,  primaryBalance: -0.042, fxDebtShare: 0.03, avgMaturityYrs: 7.4,  refinancingNeed: 0.19, reserveMonths: 13.5, stExternalDebt: 0.22, currentAccount: 0.015,  niipGdp: 0.13,  bankCapital: 0.152, privateCreditGap: 0.07,  cbIndependence: 0.42 },
  { participant: 'IN', year: 2026, inflationYoY: 0.049, inflationVol5y: 0.018, debtGdp: 0.82, interestRevenue: 0.27,  primaryBalance: -0.010, fxDebtShare: 0.04, avgMaturityYrs: 12.1, refinancingNeed: 0.18, reserveMonths: 10.2, stExternalDebt: 0.30, currentAccount: -0.012, niipGdp: -0.11, bankCapital: 0.168, privateCreditGap: 0.02,  cbIndependence: 0.78 },
  { participant: 'BR', year: 2026, inflationYoY: 0.042, inflationVol5y: 0.024, debtGdp: 0.87, interestRevenue: 0.31,  primaryBalance: -0.006, fxDebtShare: 0.06, avgMaturityYrs: 4.1,  refinancingNeed: 0.34, reserveMonths: 14.8, stExternalDebt: 0.18, currentAccount: -0.021, niipGdp: -0.34, bankCapital: 0.158, privateCreditGap: -0.01, cbIndependence: 0.71 },
  { participant: 'RU', year: 2026, inflationYoY: 0.084, inflationVol5y: 0.041, debtGdp: 0.21, interestRevenue: 0.07,  primaryBalance: -0.018, fxDebtShare: 0.19, avgMaturityYrs: 6.2,  refinancingNeed: 0.11, reserveMonths: 16.1, stExternalDebt: 0.12, currentAccount: 0.042,  niipGdp: 0.28,  bankCapital: 0.121, privateCreditGap: 0.05,  cbIndependence: 0.34 },
  { participant: 'ZA', year: 2026, inflationYoY: 0.045, inflationVol5y: 0.019, debtGdp: 0.75, interestRevenue: 0.22,  primaryBalance:  0.008, fxDebtShare: 0.11, avgMaturityYrs: 11.2, refinancingNeed: 0.16, reserveMonths: 5.4,  stExternalDebt: 0.41, currentAccount: -0.016, niipGdp: 0.07,  bankCapital: 0.172, privateCreditGap: -0.03, cbIndependence: 0.82 },
];

export const leading = [
  { participant: 'CN', asOf: T, fxVol20d: 0.041, fxCarry: -0.012, cds5y: 62,  yieldSpread: 40,  bidAskBps: 2.2, marketDepth: 4.5e6, quoteCount: 14, reserveTrend3m:  0.004, termsOfTrade3m:  0.012, inflationSurprise: -0.002, netPositionDrift:  0.22, fwdPointsBps: -140 },
  { participant: 'IN', asOf: T, fxVol20d: 0.048, fxCarry:  0.021, cds5y: 78,  yieldSpread: 165, bidAskBps: 4.8, marketDepth: 2.1e6, quoteCount: 11, reserveTrend3m:  0.018, termsOfTrade3m:  0.005, inflationSurprise:  0.003, netPositionDrift: -0.06, fwdPointsBps: 340 },
  { participant: 'BR', asOf: T, fxVol20d: 0.142, fxCarry:  0.062, cds5y: 188, yieldSpread: 420, bidAskBps: 7.5, marketDepth: 1.3e6, quoteCount: 9,  reserveTrend3m: -0.021, termsOfTrade3m: -0.038, inflationSurprise:  0.006, netPositionDrift: -0.18, fwdPointsBps: 760 },
  { participant: 'RU', asOf: T, fxVol20d: 0.268, fxCarry:  0.118, cds5y: 640, yieldSpread: 880, bidAskBps: 32,  marketDepth: 2.2e5, quoteCount: 3,  reserveTrend3m: -0.048, termsOfTrade3m: -0.062, inflationSurprise:  0.011, netPositionDrift:  0.41, fwdPointsBps: 1180 },
  { participant: 'ZA', asOf: T, fxVol20d: 0.161, fxCarry:  0.036, cds5y: 246, yieldSpread: 385, bidAskBps: 9.8, marketDepth: 7.5e5, quoteCount: 8,  reserveTrend3m: -0.009, termsOfTrade3m: -0.014, inflationSurprise:  0.001, netPositionDrift: -0.11, fwdPointsBps: 520 },
];

export const usage = (() => {
  const base = [
    ['USD', 0.5713, 0.540, 0.4425, 0.640, 0.470, 95, 11.8],
    ['EUR', 0.1980, 0.220, 0.1550, 0.220, 0.230, 80, 13.4],
    ['CNY', 0.0224, 0.049, 0.0360, 0.012, 0.045, 46, 17.2],
    ['JPY', 0.0553, 0.041, 0.0835, 0.028, 0.032, 63, 3.9],
    ['GBP', 0.0490, 0.022, 0.0645, 0.055, 0.061, 71, 3.2],
    ['INR', 0.0021, 0.018, 0.0080, 0.004, 0.015, 27, 2.6],
    ['BRL', 0.0011, 0.007, 0.0055, 0.002, 0.006, 22, 1.4],
    ['ZAR', 0.0006, 0.004, 0.0050, 0.001, 0.004, 19, 0.6],
    ['RUB', 0.0002, 0.006, 0.0030, 0.001, 0.005, 12, 1.9],
  ];
  const rows = [];
  for (const y of [2022, 2023, 2024, 2025]) {
    const k = 1 + (y - 2023) * 0.03;
    for (const [c, res, inv, tov, dbt, set, md, ts] of base) {
      rows.push({
        currency: c, year: y,
        reserveUsage: res * (c === 'USD' ? 1 / k : k),
        tradeInvoicing: inv * (c === 'USD' ? 1 / k : k),
        fxTurnover: tov, internationalDebt: dbt, crossBorderSettlement: set * (c === 'USD' ? 1 / k : k),
        marketDepth: md, tradeScale: ts,
      });
    }
  }
  return rows;
})();

export const obligations = (() => {
  const P = ['CN', 'IN', 'BR', 'RU', 'ZA'];
  const CCY = { CN: 'CNY', IN: 'INR', BR: 'BRL', RU: 'RUB', ZA: 'ZAR' };
  const SCALE = { CNY: 7.2, INR: 83, BRL: 5.4, RUB: 92, ZAR: 18.6 };
  const rows = [];
  for (let m = 1; m <= 12; m++) {
    let k = 0;
    for (const a of P) for (const b of P) {
      if (a === b) continue;
      k++;
      const r = (Math.sin(m * 37.1 + k * 11.7) + 1) / 2;
      let usdm = 60 + 340 * r;
      if (b === 'CN') usdm *= 1.85;          // hub concentration, on purpose
      if (a === 'CN') usdm *= 0.6;
      const ccy = CCY[a];
      rows.push({
        period: `2026-M${String(m).padStart(2, '0')}`,
        from: a, to: b,
        amount: Math.round(usdm * 1e6 * SCALE[ccy]),
        currency: ccy,
        sector: k % 3 === 0 ? 'energy' : k % 3 === 1 ? 'metals' : 'manufactures',
      });
    }
  }
  return rows;
})();

/**
 * One row per collateral line, so a participant appears several times. Pools are
 * DIVERSIFIED on purpose: a single-line pool trips every §24 concentration rule
 * at once, which is a data artefact rather than a finding. RU is left
 * deliberately concentrated in its own sovereign so the wrong-way machinery has
 * a genuine case to price.
 */
export const participants = [
  { participant: 'CN', sustainabilityHistory: [62, 61, 60, 59], currentBand: 'B', collateralClass: 'centralBankDeposit', collateralIssuer: 'PBOC',    collateralValue: 5.0e9, nettingOpinion: true,  settlementFinality: true },
  { participant: 'CN', collateralClass: 'ownSovereignShort', collateralIssuer: 'CN-GOVT', collateralValue: 2.6e9 },
  { participant: 'CN', collateralClass: 'ndbSecurity',       collateralIssuer: 'NDB',     collateralValue: 1.4e9 },

  { participant: 'IN', sustainabilityHistory: [56, 58, 57, 59], currentBand: 'B', collateralClass: 'ownSovereignLong',   collateralIssuer: 'IN-GOVT', collateralValue: 1.5e9, nettingOpinion: true,  settlementFinality: true },
  { participant: 'IN', collateralClass: 'centralBankDeposit', collateralIssuer: 'RBI',    collateralValue: 1.8e9 },
  { participant: 'IN', collateralClass: 'peerSovereign',      collateralIssuer: 'CN-GOVT', collateralValue: 0.9e9 },

  { participant: 'BR', sustainabilityHistory: [48, 47, 45, 44], currentBand: 'C', collateralClass: 'ownSovereignLong',   collateralIssuer: 'BR-GOVT', collateralValue: 1.0e9, nettingOpinion: true,  settlementFinality: false },
  { participant: 'BR', collateralClass: 'centralBankDeposit', collateralIssuer: 'BCB',    collateralValue: 1.1e9 },
  { participant: 'BR', collateralClass: 'ndbSecurity',        collateralIssuer: 'NDB',    collateralValue: 0.5e9 },

  { participant: 'RU', sustainabilityHistory: [41, 39, 36, 33], currentBand: 'C', collateralClass: 'ownSovereignShort',  collateralIssuer: 'RU-GOVT', collateralValue: 0.8e9, nettingOpinion: false, settlementFinality: false },
  { participant: 'RU', collateralClass: 'ownSovereignLong',   collateralIssuer: 'RU-GOVT', collateralValue: 0.3e9 },

  { participant: 'ZA', sustainabilityHistory: [52, 53, 54, 55], currentBand: 'C', collateralClass: 'peerSovereign',      collateralIssuer: 'IN-GOVT', collateralValue: 0.5e9, nettingOpinion: true,  settlementFinality: true },
  { participant: 'ZA', collateralClass: 'centralBankDeposit', collateralIssuer: 'SARB',   collateralValue: 0.4e9 },
];

export const tables = { currencies, fx_quotes, trades, fundamentals, leading, usage, obligations, participants };
export default tables;
