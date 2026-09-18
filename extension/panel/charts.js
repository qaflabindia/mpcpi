/**
 * charts.js — ECharts option builders.
 *
 * One palette, one set of axis conventions, one tooltip style, so every chart in
 * the panel reads as part of the same instrument. Colour carries meaning
 * consistently: cyan is the direct BCC-T route, amber is the dollar route,
 * emerald is a credit to the payer, rose is a charge.
 */

const C = {
  bg: 'transparent',
  text: '#cbd5e1',
  muted: '#64748b',
  grid: '#1e293b',
  axis: '#334155',
  direct: '#22d3ee',
  usd: '#f59e0b',
  charge: '#fb7185',
  credit: '#34d399',
  base: '#818cf8',
  lead: '#38bdf8',
  lag: '#a78bfa',
  series: ['#22d3ee', '#818cf8', '#f59e0b', '#34d399', '#fb7185', '#a78bfa', '#facc15', '#2dd4bf'],
};

const fmtNum = (v, d = 2) => (Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
const compact = (v) => (Number.isFinite(v) ? Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 2 }).format(v) : '—');

const base = (extra = {}) => ({
  backgroundColor: C.bg,
  textStyle: { color: C.text, fontFamily: 'ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif', fontSize: 11 },
  animationDuration: 320,
  tooltip: { trigger: 'item', className: 'echarts-tooltip-dark', confine: true, borderWidth: 0 },
  grid: { left: 52, right: 20, top: 30, bottom: 40, containLabel: true },
  ...extra,
});

const axis = (name, opts = {}) => ({
  name, nameTextStyle: { color: C.muted, fontSize: 10, padding: [0, 0, 0, 0] },
  axisLine: { lineStyle: { color: C.axis } },
  axisTick: { show: false },
  axisLabel: { color: C.muted, fontSize: 10 },
  splitLine: { lineStyle: { color: C.grid, type: 'dashed' } },
  ...opts,
});

/* ─────────────────────────── fixing ─────────────────────────── */

export function fxMatrix(fixing) {
  const cs = fixing.currencies;
  const data = [];
  for (let i = 0; i < cs.length; i++) {
    for (let j = 0; j < cs.length; j++) {
      const r = fixing.rate(cs[i], cs[j]);
      data.push([j, i, Number.isFinite(r) ? r : null]);
    }
  }
  const logs = data.map((d) => (d[2] > 0 ? Math.log10(d[2]) : null)).filter((x) => x !== null);
  return base({
    grid: { left: 56, right: 30, top: 34, bottom: 52, containLabel: true },
    tooltip: {
      className: 'echarts-tooltip-dark', borderWidth: 0,
      formatter: (p) => {
        const [j, i, v] = p.data;
        return v === null ? '—' : `<b>1 ${cs[i]}</b> = <b>${fmtNum(v, v > 100 ? 2 : 6)} ${cs[j]}</b>`;
      },
    },
    xAxis: { type: 'category', data: cs, axisLabel: { color: C.text, fontSize: 11 }, axisLine: { lineStyle: { color: C.axis } }, splitArea: { show: true, areaStyle: { color: ['transparent'] } } },
    yAxis: { type: 'category', data: cs, inverse: true, axisLabel: { color: C.text, fontSize: 11 }, axisLine: { lineStyle: { color: C.axis } } },
    visualMap: {
      min: Math.min(...logs), max: Math.max(...logs), show: false,
      inRange: { color: ['#0e7490', '#0f172a', '#7c3aed'] },
    },
    series: [{
      type: 'heatmap',
      data: data.map((d) => [d[0], d[1], d[2] === null ? null : Math.log10(d[2])]),
      label: {
        show: cs.length <= 7, fontSize: 9.5, color: '#e2e8f0',
        formatter: (p) => {
          const v = fixing.rate(cs[p.data[1]], cs[p.data[0]]);
          if (!Number.isFinite(v)) return '';
          return v === 1 ? '1' : v >= 1000 ? compact(v) : v >= 1 ? v.toFixed(2) : v.toFixed(4);
        },
      },
      itemStyle: { borderColor: '#0b1020', borderWidth: 1 },
    }],
    title: { text: 'rows buy columns · log colour scale', left: 'center', bottom: 4, textStyle: { color: C.muted, fontSize: 10, fontWeight: 'normal' } },
  });
}

export function residuals(fixing) {
  const rows = fixing.diagnostics.residuals;
  return base({
    grid: { left: 60, right: 24, top: 24, bottom: 70, containLabel: true },
    tooltip: {
      className: 'echarts-tooltip-dark', borderWidth: 0,
      formatter: (p) => {
        const r = rows[p.dataIndex];
        return `<b>${r.pair}</b><br>observed ${fmtNum(r.observed, 6)}<br>fitted ${fmtNum(r.fitted, 6)}<br>residual <b>${fmtNum(r.residualBps, 2)} bps</b><br>weight ${fmtNum(r.weight, 3)}`;
      },
    },
    xAxis: axis('', { type: 'category', data: rows.map((r) => r.pair), axisLabel: { color: C.muted, fontSize: 9, rotate: 45, interval: 0 } }),
    yAxis: axis('residual (bps)', { type: 'value' }),
    series: [{
      type: 'bar',
      data: rows.map((r) => ({
        value: r.residualBps,
        itemStyle: { color: Math.abs(r.residualBps) > 25 ? C.usd : C.direct, opacity: 0.35 + 0.65 * Math.min(1, r.weight) },
      })),
      barMaxWidth: 26,
      markLine: { silent: true, symbol: 'none', data: [{ yAxis: 0 }], lineStyle: { color: C.axis } },
    }],
  });
}

/* ─────────────────────────── basket ─────────────────────────── */

export function basketWeights(basket) {
  const c = basket.components;
  return base({
    legend: { data: ['raw economic weight', 'capped weight'], textStyle: { color: C.muted, fontSize: 10 }, top: 2 },
    tooltip: { trigger: 'axis', className: 'echarts-tooltip-dark', borderWidth: 0, valueFormatter: (v) => `${fmtNum(v, 2)}%` },
    xAxis: axis('', { type: 'category', data: c.map((x) => x.code), axisLabel: { color: C.text, fontSize: 11 } }),
    yAxis: axis('weight (%)', { type: 'value' }),
    series: [
      { name: 'raw economic weight', type: 'bar', data: c.map((x) => +(x.rawWeight * 100).toFixed(3)), itemStyle: { color: '#475569' }, barGap: '-55%', barMaxWidth: 36 },
      {
        name: 'capped weight', type: 'bar', barMaxWidth: 22,
        data: c.map((x) => ({ value: +(x.finalWeight * 100).toFixed(3), itemStyle: { color: x.capped ? C.usd : C.direct } })),
        markLine: {
          silent: true, symbol: 'none',
          data: [{ yAxis: basket.config.maximumWeight * 100, label: { formatter: `cap ${(basket.config.maximumWeight * 100).toFixed(0)}%`, color: C.usd, fontSize: 10 } }],
          lineStyle: { color: C.usd, type: 'dashed' },
        },
      },
    ],
  });
}

export function basketValues(values) {
  const rows = Object.entries(values).map(([k, v]) => ({ code: k, value: v.value })).sort((a, b) => b.value - a.value);
  return base({
    grid: { left: 60, right: 70, top: 16, bottom: 24, containLabel: true },
    tooltip: { className: 'echarts-tooltip-dark', borderWidth: 0, formatter: (p) => `one BCC-T unit = <b>${fmtNum(p.value, 4)} ${p.name}</b>` },
    xAxis: axis('units per BCC-T (log)', { type: 'log' }),
    yAxis: axis('', { type: 'category', data: rows.map((r) => r.code), axisLabel: { color: C.text, fontSize: 11 } }),
    series: [{
      type: 'bar', data: rows.map((r) => ({ value: r.value, name: r.code })),
      itemStyle: { color: (p) => C.series[p.dataIndex % C.series.length], borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', color: C.muted, fontSize: 10, formatter: (p) => fmtNum(p.value, p.value > 100 ? 1 : 3) },
      barMaxWidth: 20,
    }],
  });
}

/* ─────────────────────────── diagnostics ─────────────────────────── */

export function divergence(diagnostics) {
  const rows = diagnostics.filter((d) => d.composite?.leading != null && d.composite?.lagging != null);
  return base({
    grid: { left: 64, right: 24, top: 22, bottom: 58, containLabel: true },
    tooltip: {
      className: 'echarts-tooltip-dark', borderWidth: 0,
      formatter: (p) => {
        const d = rows[p.dataIndex];
        return `<b>${d.participant}</b> ${d.currency ? `(${d.currency})` : ''}<br>leading ${fmtNum(d.composite.leading, 1)}<br>lagging ${fmtNum(d.composite.lagging, 1)}<br>divergence <b>${fmtNum(d.composite.divergence, 1)}</b><br>${d.composite.signal}`;
      },
    },
    xAxis: axis('lagging — realised fundamentals', { type: 'value', min: 0, max: 100, nameLocation: 'middle', nameGap: 26 }),
    yAxis: axis('leading — market signals', { type: 'value', min: 0, max: 100, nameLocation: 'middle', nameGap: 34 }),
    series: [{
      type: 'scatter',
      symbolSize: (v) => 14 + Math.min(18, Math.abs(v[2]) * 0.55),
      data: rows.map((d) => [d.composite.lagging, d.composite.leading, d.composite.divergence]),
      itemStyle: { color: (p) => (p.data[2] < -12 ? C.charge : p.data[2] > 12 ? C.credit : C.direct), opacity: 0.85 },
      label: { show: true, position: 'top', color: C.text, fontSize: 10, formatter: (p) => rows[p.dataIndex].participant },
      markLine: {
        silent: true, symbol: 'none', lineStyle: { color: C.axis, type: 'dashed' },
        data: [[{ coord: [0, 0] }, { coord: [100, 100] }]],
        label: { show: false },
      },
    }],
    // Below the diagonal, markets are pricing something the published
    // fundamentals do not yet show. Said once, in the corner, rather than
    // painted across the plot.
    graphic: [
      { type: 'text', right: 30, top: '62%', silent: true, style: { text: 'below the line:\nmarkets ahead, to the downside', fill: '#64748b', fontSize: 9.5, lineHeight: 12, textAlign: 'right' } },
      { type: 'text', left: 76, top: 28, silent: true, style: { text: 'above the line:\nfundamentals lag the improvement', fill: '#64748b', fontSize: 9.5, lineHeight: 12 } },
    ],
  });
}

export function healthRadar(diagnostics) {
  const rows = diagnostics.filter((d) => d.health?.chs != null);
  const dims = [
    ['priceStability', 'Price stability'],
    ['fiscalSustainability', 'Fiscal'],
    ['externalResilience', 'External'],
    ['monetaryFinancialResilience', 'Monetary'],
  ];
  return base({
    grid: undefined,
    legend: { data: rows.map((r) => r.participant), textStyle: { color: C.muted, fontSize: 10 }, top: 2, type: 'scroll' },
    tooltip: { className: 'echarts-tooltip-dark', borderWidth: 0 },
    radar: {
      indicator: dims.map(([, label]) => ({ name: label, max: 100 })),
      radius: '64%', center: ['50%', '56%'],
      axisName: { color: C.muted, fontSize: 10 },
      splitLine: { lineStyle: { color: C.grid } },
      splitArea: { areaStyle: { color: ['rgba(30,41,59,.25)', 'transparent'] } },
      axisLine: { lineStyle: { color: C.grid } },
    },
    series: [{
      type: 'radar',
      data: rows.map((d, i) => ({
        name: d.participant,
        value: dims.map(([k]) => d.health.blocks[k]?.score ?? 0),
        lineStyle: { color: C.series[i % C.series.length], width: 1.6 },
        itemStyle: { color: C.series[i % C.series.length] },
        areaStyle: { color: C.series[i % C.series.length], opacity: 0.07 },
      })),
    }],
  });
}

export function excessUsage(model) {
  const rows = model.persistentByCurrency;
  return base({
    grid: { left: 56, right: 30, top: 20, bottom: 44, containLabel: true },
    tooltip: {
      className: 'echarts-tooltip-dark', borderWidth: 0,
      formatter: (p) => {
        const r = rows[p.dataIndex];
        return `<b>${r.currency}</b><br>mean excess usage ${fmtNum(r.meanExcessUsage, 2)}<br>SE ${fmtNum(r.se, 2)} · t ${fmtNum(r.t, 2)}<br>${r.significant ? 'significant at 5%' : 'not significant at 5%'} · n=${r.n}`;
      },
    },
    xAxis: axis('', { type: 'category', data: rows.map((r) => r.currency), axisLabel: { color: C.text, fontSize: 11 } }),
    yAxis: axis('CPS points unexplained', { type: 'value' }),
    series: [
      {
        type: 'bar', barMaxWidth: 34,
        data: rows.map((r) => ({
          value: r.meanExcessUsage,
          itemStyle: { color: r.meanExcessUsage > 0 ? C.usd : C.direct, opacity: r.significant ? 1 : 0.4 },
        })),
        markLine: { silent: true, symbol: 'none', data: [{ yAxis: 0 }], lineStyle: { color: C.axis } },
      },
      {
        type: 'custom', silent: true,
        renderItem: (params, api) => {
          const r = rows[api.value(0)];
          if (!Number.isFinite(r?.se)) return null;
          const x = api.coord([api.value(0), 0])[0];
          const hi = api.coord([api.value(0), r.meanExcessUsage + 1.96 * r.se])[1];
          const lo = api.coord([api.value(0), r.meanExcessUsage - 1.96 * r.se])[1];
          return {
            type: 'group',
            children: [
              { type: 'line', shape: { x1: x, y1: hi, x2: x, y2: lo }, style: { stroke: C.text, lineWidth: 1 } },
              { type: 'line', shape: { x1: x - 6, y1: hi, x2: x + 6, y2: hi }, style: { stroke: C.text, lineWidth: 1 } },
              { type: 'line', shape: { x1: x - 6, y1: lo, x2: x + 6, y2: lo }, style: { stroke: C.text, lineWidth: 1 } },
            ],
          };
        },
        data: rows.map((_, i) => [i]),
      },
    ],
  });
}

/* ─────────────────────────── netting ─────────────────────────── */

export function nettingBars(periods) {
  const p = periods;
  return base({
    legend: { data: ['gross', 'bilaterally netted', 'multilaterally netted'], textStyle: { color: C.muted, fontSize: 10 }, top: 2, type: 'scroll' },
    tooltip: { trigger: 'axis', className: 'echarts-tooltip-dark', borderWidth: 0, valueFormatter: (v) => compact(v) },
    xAxis: axis('', { type: 'category', data: p.map((x) => x.period ?? 'period'), axisLabel: { color: C.muted, fontSize: 9, rotate: p.length > 8 ? 45 : 0 } }),
    yAxis: [axis('BCC-T', { type: 'value', axisLabel: { color: C.muted, fontSize: 10, formatter: compact } }),
      axis('compression (%)', { type: 'value', min: 0, max: 100, position: 'right', splitLine: { show: false } })],
    series: [
      { name: 'gross', type: 'bar', data: p.map((x) => x.grossSettlement), itemStyle: { color: '#475569' }, barMaxWidth: 26 },
      { name: 'bilaterally netted', type: 'bar', data: p.map((x) => x.bilateralNetSettlement), itemStyle: { color: C.base }, barMaxWidth: 26 },
      { name: 'multilaterally netted', type: 'bar', data: p.map((x) => x.netSettlement), itemStyle: { color: C.direct }, barMaxWidth: 26 },
      { name: 'compression', type: 'line', yAxisIndex: 1, data: p.map((x) => x.liquiditySavingPercent), lineStyle: { color: C.credit, width: 2 }, itemStyle: { color: C.credit }, symbolSize: 5 },
    ],
  });
}

export function netPositions(persistence) {
  return base({
    legend: { data: persistence.map((p) => p.participant), textStyle: { color: C.muted, fontSize: 10 }, top: 2, type: 'scroll' },
    tooltip: { trigger: 'axis', className: 'echarts-tooltip-dark', borderWidth: 0, valueFormatter: (v) => compact(v) },
    xAxis: axis('period', { type: 'category', data: persistence[0]?.series.map((_, i) => i + 1) ?? [] }),
    yAxis: axis('net position (BCC-T)', { type: 'value', axisLabel: { color: C.muted, fontSize: 10, formatter: compact } }),
    series: persistence.map((p, i) => ({
      name: p.participant, type: 'line', smooth: 0.2, data: p.series,
      lineStyle: { color: C.series[i % C.series.length], width: p.classification.startsWith('structural') ? 2.6 : 1.4 },
      itemStyle: { color: C.series[i % C.series.length] }, symbolSize: 4,
    })).concat([{
      type: 'line', data: [], markLine: { silent: true, symbol: 'none', data: [{ yAxis: 0 }], lineStyle: { color: C.axis, type: 'dashed' } },
    }]),
  });
}

export function sankey(netting) {
  const nodes = netting.participants.map((p, i) => ({ name: p, itemStyle: { color: C.series[i % C.series.length] } }));
  const links = Object.entries(netting.bilateralMatrix)
    .map(([k, v]) => { const [source, target] = k.split('→'); return { source, target, value: v }; })
    .filter((l) => l.value > 0);
  // A Sankey cannot render a cycle, and bilateral trade is full of them. Use a
  // chord-style graph instead, which shows the two-way flows honestly.
  return base({
    grid: undefined,
    tooltip: { className: 'echarts-tooltip-dark', borderWidth: 0, formatter: (p) => (p.dataType === 'edge' ? `${p.data.source} → ${p.data.target}<br><b>${compact(p.data.value)}</b> BCC-T` : `<b>${p.name}</b>`) },
    series: [{
      type: 'graph', layout: 'circular', circular: { rotateLabel: true },
      data: nodes.map((n) => {
        const pos = netting.positions.find((x) => x.participant === n.name);
        return {
          ...n,
          symbolSize: 18 + Math.min(40, Math.sqrt(Math.abs(pos?.netPosition ?? 0)) / Math.max(1, Math.sqrt(netting.netSettlement)) * 44),
          itemStyle: { color: pos?.side === 'creditor' ? C.credit : pos?.side === 'debtor' ? C.charge : C.muted },
        };
      }),
      links: links.map((l) => ({ ...l, lineStyle: { width: Math.max(0.6, (l.value / netting.grossSettlement) * 40), curveness: 0.28, opacity: 0.45, color: 'source' } })),
      label: { show: true, color: C.text, fontSize: 11, position: 'right' },
      edgeSymbol: ['none', 'arrow'], edgeSymbolSize: 6,
      emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.9 } },
    }],
    title: { text: 'green = net creditor · red = net debtor · arrows show who pays whom', left: 'center', bottom: 2, textStyle: { color: C.muted, fontSize: 10, fontWeight: 'normal' } },
  });
}

/* ─────────────────────────── invoice ─────────────────────────── */

export function waterfall(invoice, ccy = 'BCCT', mode = 'full') {
  const key = ccy === 'BCCT' ? 'amountBCCT' : ccy === invoice.sellerCurrency ? 'amountSeller' : 'amountBuyer';
  if (mode === 'spread') return spreadWaterfall(invoice, ccy, key);
  const lines = invoice.lines;
  const labels = [], support = [], pos = [], neg = [];
  let run = 0;
  for (const l of lines) {
    const v = l[key];
    labels.push(shortLabel(l.label));
    if (l.key === 'base') { support.push(0); pos.push(v); neg.push('-'); run = v; continue; }
    if (v >= 0) { support.push(run); pos.push(v); neg.push('-'); run += v; }
    else { run += v; support.push(run); pos.push('-'); neg.push(-v); }
  }
  labels.push('Invoice price'); support.push(0); pos.push(run); neg.push('-');

  return base({
    grid: { left: 60, right: 24, top: 26, bottom: 96, containLabel: true },
    tooltip: {
      className: 'echarts-tooltip-dark', borderWidth: 0, trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (ps) => {
        const i = ps[0].dataIndex;
        if (i >= lines.length) return `<b>Invoice price</b><br>${fmtNum(run, 2)} ${ccy === 'BCCT' ? 'BCC-T' : ccy}`;
        const l = lines[i];
        return `<b>${l.label}</b><br>${l.section}<br>${fmtNum(l[key], 2)} ${ccy === 'BCCT' ? 'BCC-T' : ccy}<br>${fmtNum(l.bps, 2)} bps of base${l.detail ? `<br><span style="color:#94a3b8">${l.detail}</span>` : ''}`;
      },
    },
    xAxis: axis('', { type: 'category', data: labels, axisLabel: { color: C.muted, fontSize: 9.5, rotate: 40, interval: 0, width: 92, overflow: 'break' } }),
    yAxis: axis(ccy === 'BCCT' ? 'BCC-T' : ccy, { type: 'value', axisLabel: { color: C.muted, fontSize: 10, formatter: compact } }),
    series: [
      { name: 'support', type: 'bar', stack: 'w', silent: true, itemStyle: { color: 'transparent' }, data: support, emphasis: { itemStyle: { color: 'transparent' } } },
      {
        name: 'increase', type: 'bar', stack: 'w', barMaxWidth: 40,
        data: pos.map((v, i) => ({ value: v, itemStyle: { color: i === 0 ? C.base : i === labels.length - 1 ? C.direct : C.charge } })),
      },
      { name: 'decrease', type: 'bar', stack: 'w', barMaxWidth: 40, data: neg, itemStyle: { color: C.credit } },
    ],
  });
}

/**
 * The comparison that means something: infrastructure against infrastructure.
 *
 * Both routes carry the same interest carry and the same unhedged FX risk on
 * the same goods, and on a volatile pair that common block is fifty times the
 * difference between the two settlement designs. Charting the all-in totals
 * therefore compares two nearly identical numbers and hides the mechanism, so
 * this chart shows the route-specific costs only, with the common block stated
 * once beneath it.
 */
export function routeCompare(invoice) {
  if (!invoice.comparison || invoice.comparison.unavailable) return null;
  const d = invoice.comparison.differential;
  if (!d) return null;

  const keys = [...new Set([...d.directDetail.map((x) => x.key), ...d.usdDetail.map((x) => x.key)])];
  const label = {
    fxConversion: 'Conversion', creditCharge: 'Counterparty credit', counterpartyCredit: 'Counterparty credit',
    marginFunding: 'Margin funding', clearingFee: 'Clearing fee', nettingRebate: 'Netting rebate',
    wrongWaySurcharge: 'Wrong-way', settlementFees: 'Settlement fees',
    correspondentFees: 'Corresp. fees', correspondentCredit: 'Corresp. in-flight',
    principalRisk: 'Principal, no PvP', nostroFloat: 'Nostro float',
  };
  const merged = [];
  for (const k of keys) {
    const dk = k === 'counterpartyCredit' ? 'creditCharge' : k;
    if (merged.some((m) => m.k === dk)) continue;
    merged.push({
      k: dk,
      name: label[dk] || dk,
      direct: d.directDetail.find((x) => x.key === dk)?.bps ?? 0,
      usd: d.usdDetail.find((x) => x.key === k || x.key === dk)?.bps ?? 0,
    });
  }
  merged.sort((a, b) => (Math.abs(b.direct) + Math.abs(b.usd)) - (Math.abs(a.direct) + Math.abs(a.usd)));

  return base({
    grid: { left: 8, right: 30, top: 34, bottom: 44, containLabel: true },
    legend: { data: ['BCC-T direct', `via ${invoice.usdRoute.vehicle || 'USD'}`], textStyle: { color: C.muted, fontSize: 10 }, top: 2 },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, className: 'echarts-tooltip-dark', borderWidth: 0,
      valueFormatter: (v) => `${fmtNum(v, 2)} bps`,
    },
    xAxis: axis('bps of the commercial base', { type: 'value' }),
    yAxis: axis('', { type: 'category', data: merged.map((m) => m.name), axisLabel: { color: C.muted, fontSize: 9.5, interval: 0 }, inverse: true }),
    series: [
      { name: 'BCC-T direct', type: 'bar', data: merged.map((m) => m.direct), itemStyle: { color: C.direct }, barMaxWidth: 11 },
      { name: `via ${invoice.usdRoute.vehicle || 'USD'}`, type: 'bar', data: merged.map((m) => m.usd), itemStyle: { color: C.usd }, barMaxWidth: 11 },
    ],
    graphic: [{
      type: 'text', left: 'center', bottom: 4, silent: true,
      style: {
        text: `direct ${d.directInfrastructureBps.toFixed(2)} bps   ·   via ${invoice.usdRoute.vehicle || 'USD'} ${d.usdInfrastructureBps.toFixed(2)} bps   ·   common to both ${d.commonToBothBps.toFixed(0)} bps (excluded)`,
        fill: '#64748b', fontSize: 10,
      },
    }],
  });
}

export function sensitivity(grid) {
  return base({
    grid: { left: 60, right: 24, top: 28, bottom: 40, containLabel: true },
    legend: { data: grid.series.map((s) => s.name), textStyle: { color: C.muted, fontSize: 10 }, top: 2 },
    tooltip: { trigger: 'axis', className: 'echarts-tooltip-dark', borderWidth: 0, valueFormatter: (v) => `${fmtNum(v, 1)} bps` },
    xAxis: axis('settlement days', { type: 'category', data: grid.days }),
    yAxis: axis('spread over base (bps)', { type: 'value' }),
    series: grid.series.map((s, i) => ({
      name: s.name, type: 'line', smooth: 0.25, data: s.values,
      lineStyle: { color: C.series[i % C.series.length], width: 2 },
      itemStyle: { color: C.series[i % C.series.length] }, symbolSize: 4,
      areaStyle: i === 0 ? { color: C.series[0], opacity: 0.06 } : undefined,
    })),
  });
}

export function bookComponents(summary) {
  const rows = summary.components;
  return base({
    grid: { left: 150, right: 60, top: 16, bottom: 34, containLabel: true },
    tooltip: { className: 'echarts-tooltip-dark', borderWidth: 0, formatter: (p) => `<b>${rows[p.dataIndex].label}</b><br>${rows[p.dataIndex].section}<br>${fmtNum(p.value, 2)} bps of the book` },
    xAxis: axis('bps of book base', { type: 'value' }),
    yAxis: axis('', { type: 'category', data: rows.map((r) => shortLabel(r.label)), axisLabel: { color: C.muted, fontSize: 10 } }),
    series: [{
      type: 'bar', barMaxWidth: 18,
      data: rows.map((r) => ({ value: r.bpsOfBook, itemStyle: { color: r.bpsOfBook >= 0 ? C.charge : C.credit } })),
      label: { show: true, position: 'right', color: C.muted, fontSize: 10, formatter: (p) => `${fmtNum(p.value, 1)}` },
    }],
  });
}

/**
 * The same decomposition with the commercial base removed, so the components
 * are on a scale where they can be compared. Starts at zero and accumulates to
 * the total spread.
 */
function spreadWaterfall(invoice, ccy, key) {
  const lines = invoice.lines.filter((l) => l.key !== 'base');
  const labels = [], support = [], pos = [], neg = [];
  let run = 0;
  for (const l of lines) {
    const v = l[key];
    labels.push(shortLabel(l.label));
    if (v >= 0) { support.push(run); pos.push(v); neg.push('-'); run += v; }
    else { run += v; support.push(run); pos.push('-'); neg.push(-v); }
  }
  labels.push('Total spread'); support.push(0); pos.push(run); neg.push('-');

  return base({
    grid: { left: 60, right: 24, top: 26, bottom: 96, containLabel: true },
    tooltip: {
      className: 'echarts-tooltip-dark', borderWidth: 0, trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (ps) => {
        const i = ps[0].dataIndex;
        if (i >= lines.length) return `<b>Total spread</b><br>${fmtNum(run, 2)} ${ccy === 'BCCT' ? 'BCC-T' : ccy}<br>${fmtNum(invoice.invoicePrice.spreadOverBaseBps, 1)} bps over base`;
        const l = lines[i];
        return `<b>${l.label}</b><br>${l.section}<br>${fmtNum(l[key], 2)} ${ccy === 'BCCT' ? 'BCC-T' : ccy}<br>${fmtNum(l.bps, 2)} bps of base${l.detail ? `<br><span style="color:#94a3b8">${l.detail}</span>` : ''}`;
      },
    },
    xAxis: axis('', { type: 'category', data: labels, axisLabel: { color: C.muted, fontSize: 9.5, rotate: 40, interval: 0, width: 92, overflow: 'break' } }),
    yAxis: axis(`${ccy === 'BCCT' ? 'BCC-T' : ccy} over the commercial base`, { type: 'value', axisLabel: { color: C.muted, fontSize: 10, formatter: compact } }),
    series: [
      { name: 'support', type: 'bar', stack: 'w', silent: true, itemStyle: { color: 'transparent' }, data: support, emphasis: { itemStyle: { color: 'transparent' } } },
      { name: 'increase', type: 'bar', stack: 'w', barMaxWidth: 40, data: pos.map((v, i) => ({ value: v, itemStyle: { color: i === labels.length - 1 ? C.direct : C.charge } })) },
      { name: 'decrease', type: 'bar', stack: 'w', barMaxWidth: 40, data: neg, itemStyle: { color: C.credit } },
    ],
  });
}

function shortLabel(s) {
  return String(s)
    .replace('Commercial base at the multilateral fixing', 'Commercial base')
    .replace(/Covered-interest carry to T\+\d+/, 'CIP carry')
    .replace(/Unhedged FX premium.*/, 'Unhedged FX premium')
    .replace(/Counterparty credit, band ./, 'Counterparty credit')
    .replace('Initial-margin funding', 'Margin funding')
    .replace('BCCC clearing fee', 'Clearing fee')
    .replace('Multilateral netting rebate', 'Netting rebate')
    .replace('Collateral wrong-way loading', 'Wrong-way loading')
    .replace('Composite leading/lagging adjustment', 'Leading/lagging');
}

/* ─────────────────────────── lifecycle ─────────────────────────── */

const instances = new Map();
const observers = new Map();

/**
 * A chart created while its tab is hidden has a zero-width container, and
 * ECharts falls back to a default size that never corrects itself on a plain
 * `resize()` call raced against layout. A ResizeObserver per container is the
 * reliable fix: the chart sizes itself the moment the element actually gets
 * dimensions, whichever tab it is on.
 */
function observe(elId, el, inst) {
  if (observers.has(elId)) return;
  if (typeof ResizeObserver !== 'function') return;
  const ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0 && !inst.isDisposed?.()) inst.resize({ width, height });
    }
  });
  ro.observe(el);
  observers.set(elId, ro);
}

export function render(elId, option) {
  const el = document.getElementById(elId);
  if (!el) return null;
  if (!option) {
    const prev = instances.get(elId);
    if (prev && !prev.isDisposed?.()) { prev.dispose(); instances.delete(elId); }
    observers.get(elId)?.disconnect();
    observers.delete(elId);
    el.innerHTML = '<div class="grid h-full place-items-center text-[12px] text-slate-600">no data</div>';
    return null;
  }
  let inst = instances.get(elId);
  if (!inst || inst.isDisposed?.()) {
    el.innerHTML = '';
    inst = echarts.init(el, null, { renderer: 'canvas' });
    instances.set(elId, inst);
    observe(elId, el, inst);
  }
  inst.setOption(option, true);
  // If the container already has a size, take it now rather than waiting for
  // the observer's first asynchronous callback.
  if (el.clientWidth > 0 && el.clientHeight > 0) inst.resize();
  return inst;
}

export function resizeAll() {
  for (const [id, i] of instances) {
    if (i.isDisposed?.()) continue;
    const el = document.getElementById(id);
    if (el && el.clientWidth > 0 && el.clientHeight > 0) i.resize();
  }
}

