/**
 * help.js — the explanations behind the little ⓘ marks.
 *
 * Kept in one registry rather than scattered through the markup so the wording
 * stays consistent, cites the framework section it comes from, and can be
 * reviewed as a body of text in its own right. A figure nobody can interpret is
 * not transparency.
 */

export const HELP = {
  /* ── data ── */
  sheetsRead: ['Sheets read', 'How many tabs the workbook contained and how many matched a table this tool understands. Unrecognised tabs are ignored and named in the report below.'],
  rowsRead: ['Rows', 'Data rows accepted across every recognised sheet, after blank rows are dropped.'],
  mappingWarnings: ['Mapping warnings', 'Column headers matched below 85% confidence, plus headers that were not used at all. Nothing here stops the run; it flags where a header may have reached the wrong column.'],
  dataIssues: ['Data issues', 'Cell-level problems: values that would not parse, and percentages written into a column that expects a ratio. Each is listed with its sheet and row.'],

  /* ── fixing ── */
  internalMatrix: ['Internal matrix', 'Whether the participating currencies were fitted on their own. Pooling the vehicle currency\'s quotes into the same fit lets them decide the participating cross rates, because those legs are the deepest in any real quote set.', '§37'],
  quotesAccepted: ['Quotes accepted', 'Quotes that survived the entry filters and the outlier rule, and therefore carried weight in the fit. Rejections are listed below with their reason.', '§9'],
  weightedRMSE: ['Weighted RMSE', 'How far the accepted quotes sit from the fitted matrix, weighted by their reliability. Large values mean the quotes disagree with each other, not that the fit is wrong.', '§8'],
  inputInconsistency: ['Input inconsistency', 'The worst triangular violation present in your RAW quotes — the amount by which A→B→C disagreed with A→C before fitting. The published matrix resolves this by construction.', '§8'],
  perBCCT: ['Units per BCC-T', 'How many units of this currency one BCC-T buys. This is the primary quotation: every bilateral rate is the ratio of two of these, so no third currency is needed to discover any pair.', '§5, §37'],
  inBCCT: ['BCC-T per unit', 'The reciprocal — how much of one BCC-T a single unit of this currency buys.'],
  satelliteRole: ['Role', 'A participant is inside the network and fitted with it. A satellite is external: priced against the network afterwards, quotable and payable, but with no influence on any participating cross rate.', '§37'],
  ownShare: ['Own share of value', 'How much of one BCC-T\'s value this currency contributes through its own quantity. It is why a basket containing a currency cannot independently measure it.', '§7'],

  /* ── basket ── */
  economicScore: ['Economic score', 'The weighted blend of intra-network trade share, GDP share, FX liquidity and convertibility. Debt sustainability is deliberately excluded — diagnostics must not move the ruler.', '§6, §4'],
  rawWeight: ['Raw weight', 'The economic score normalised so all currencies sum to one, before the concentration ceiling is applied.', '§6'],
  finalWeight: ['Final weight', 'After capping any currency at the ceiling and redistributing the excess proportionally among the uncapped, iterated until nothing exceeds the cap and the total is still one.', '§6'],
  fixedQuantity: ['Fixed quantity', 'The actual number of units of this currency in one BCC-T. FIXED until a scheduled reconstitution: this is the quantity vector that makes the unit replicable by anyone holding the published rates.', '§5'],
  drift: ['Drift', 'How far the realised weight has moved from the constitution weight as rates changed. A fixed-quantity basket re-weights itself; that is a reason to reconstitute on schedule, not to re-weight continuously.', '§6'],
  selfReference: ['Self-reference attenuation', 'A shock to a currency measured against a basket that contains it registers at only (1 − weight) of its true size, because the basket moves with it.', '§7'],

  /* ── diagnostics ── */
  chs: ['CHS', 'Currency Health Score: price stability, fiscal sustainability, external resilience and monetary-financial resilience. International usage is deliberately excluded — health and internationalisation are separate phenomena.', '§10'],
  coverage: ['Coverage', 'The worst of the CHS, leading and lagging blocks — the share of indicators that actually had a value. Hover the badge for the split. Missing inputs are never imputed favourably.', '§15'],
  leadingIdx: ['Leading', 'Market signals that move before the outcome: volatility, spreads, CDS, reserve trend, depth. Fast, rarely revised.', '§15'],
  laggingIdx: ['Lagging', 'Realised structural data that confirms after the outcome: debt ratios, reserve cover, current account, bank capital. Slow, heavily revised.', '§15'],
  composite: ['Composite', 'The horizon-weighted blend, w_L(T) = exp(−T/τ). A short settlement is dominated by market signal; a long exposure by structural fundamentals.', '§15'],
  divergence: ['Divergence', 'Leading minus lagging. Strongly negative means markets have moved while the published fundamentals have not caught up — an early warning, not a verdict.', '§15'],
  band: ['Supervisory band', 'A to D, from a multi-period average of fiscal sustainability with hysteresis on upgrades. Bands set margin and unsecured limits; they never multiply into a daily credit line, which would be procyclical.', '§25'],
  cps: ['CPS', 'Currency Power Score: international usage — reserves, invoicing, turnover, international debt, settlement. An annual research statistic, not a daily index.', '§14'],
  excessUsage: ['Excess usage', 'The residual from CPS regressed on health, market depth and trade scale. A positive value means usage exceeds what fundamentals predict. It is an estimate with a standard error, not a claim of unearned privilege.', '§16'],

  /* ── netting ── */
  grossObligations: ['Gross obligations', 'Every bilateral payment obligation added up, before any netting.', '§19'],
  afterNetting: ['After multilateral netting', 'The minimum that must actually change hands once every position is netted across all participants at once.', '§19'],
  compression: ['Compression', 'How much of the gross flow multilateral netting removes. This is an accounting identity — it says nothing about whether the residual balances are acceptable.', '§19'],
  concentration: ['Concentration', 'Herfindahl index of the residual net positions. High values mean the leftover balances pile onto one participant, which is the failure mode netting efficiency alone hides.', '§19, §20'],
  persistence: ['Persistence', 'Whether a participant stays on the same side period after period. A structural creditor accumulates claims it must be able to use, which makes the creditor-asset layer the binding constraint.', '§20, §26'],
  lag1: ['Lag-1 autocorrelation', 'How strongly this period\'s net position predicts the next. High and positive means balances persist rather than oscillating away.', '§20'],

  /* ── invoice ── */
  invoicesPriced: ['Invoices priced', 'Trades successfully priced from the workbook. Failures are listed with their reason.'],
  bookValue: ['Book value', 'The whole book at its invoice price, in BCC-T, against the commercial base beneath it.'],
  weightedSpread: ['Weighted spread', 'The book\'s total charge over its commercial base, in basis points.'],
  infraVsUsd: ['Infrastructure vs the dollar route', 'The route-specific cost difference only. Interest carry and unhedged FX risk are identical on both routes and are excluded, because they dwarf the difference and would otherwise decide the comparison.', '§28, §37'],
  spreadOverBase: ['Spread over base', 'Everything charged on top of the commercial value of the goods, in basis points.'],
  oneBcct: ['One BCC-T', 'What a single BCC-T unit is worth in each side\'s currency at this fixing — the conversion used throughout this invoice.', '§5'],
  fxConversion: ['Conversion', 'The cost of crossing the spread, taken from your own quotes along the cheapest path that stays inside the participating network. A thin cross is priced as thin.', '§8, §28'],
  volPremium: ['Unhedged FX premium', 'The one-sided cost of the unhedged portion over the settlement horizon. Identical on both routes, and on a volatile pair it is far larger than any infrastructure difference.', '§23'],
  nettingRebate: ['Netting rebate', 'The share of realised compression passed back, earned over the settlement cycle rather than the commercial credit period — nobody funds the settlement amount for the life of the invoice.', '§19'],
  wrongWay: ['Wrong-way loading', 'An increment to the credit charge for collateral whose value falls with the poster\'s own credit. Concentration breaches restrict credit capacity instead; charging both would be double counting.', '§24'],
  dependency: ['Dollar dependency', 'Whether each of the five functions can be performed without the vehicle currency. The framework writes it as a product, which hits zero as soon as any one factor does — the per-dimension count is the useful read.', '§37'],

  /* ── workings ── */
  reconciliation: ['Reconciliation', 'The derivation is recomputed from its recorded inputs and compared against the published figure, allowing for the decimal place it was published at. A mismatch is reported rather than hidden — an explanation that cannot be wrong is not evidence.'],
};

let pop = null;

function ensurePop() {
  if (pop) return pop;
  pop = document.createElement('div');
  pop.className = 'help-pop';
  document.body.append(pop);
  return pop;
}

function show(target, key) {
  const entry = HELP[key];
  if (!entry) return;
  const [title, body, section] = entry;
  const p = ensurePop();
  p.innerHTML = `<b>${title}</b><br>${body}${section ? `<span class="sec">${section}</span>` : ''}`;
  p.classList.add('show');
  const r = target.getBoundingClientRect();
  p.style.visibility = 'hidden';
  p.style.left = '0px'; p.style.top = '0px';
  requestAnimationFrame(() => {
    const pr = p.getBoundingClientRect();
    let left = Math.min(r.left, window.innerWidth - pr.width - 12);
    let top = r.bottom + 6;
    if (top + pr.height > window.innerHeight - 8) top = Math.max(8, r.top - pr.height - 6);
    p.style.left = `${Math.max(8, left)}px`;
    p.style.top = `${top}px`;
    p.style.visibility = 'visible';
  });
}

const hide = () => pop?.classList.remove('show');

/** `<span class="help" data-help="key">` markup for a given registry entry. */
export const helpMark = (key) => (HELP[key] ? `<span class="help" data-help="${key}" tabindex="0" role="button" aria-label="${HELP[key][0]}: explain">i</span>` : '');

/** One delegated listener for the whole panel; works for markup added later. */
export function installHelp() {
  document.addEventListener('pointerover', (e) => {
    const t = e.target.closest?.('[data-help]');
    if (t) show(t, t.dataset.help);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.target.closest?.('[data-help]')) hide();
  });
  document.addEventListener('focusin', (e) => {
    const t = e.target.closest?.('[data-help]');
    if (t) show(t, t.dataset.help);
  });
  document.addEventListener('focusout', hide);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  window.addEventListener('scroll', hide, true);
}
