/**
 * help.js — the explanations behind the little ⓘ marks.
 *
 * Kept in one registry rather than scattered through the markup so the wording
 * stays consistent, cites the framework section it comes from, and can be
 * reviewed as a body of text in its own right. A figure nobody can interpret is
 * not transparency.
 */

/**
 * Each entry is [title, plain explanation, framework section].
 *
 * The plain explanation comes first and does the work. It says what the number
 * means to someone reading it for the first time, and why they should care.
 * Where a technical term is unavoidable it is defined on the spot rather than
 * assumed. The section reference is for the reader checking against the paper.
 */
export const HELP = {
  /* ── data ── */
  sheetsRead: ['Sheets read', 'How many tabs were in your file, and how many of them this tool recognised. Tabs it does not recognise are skipped and named below, so nothing disappears silently.'],
  rowsRead: ['Rows', 'How many rows of actual data were read, once blank rows are dropped.'],
  mappingWarnings: ['Mapping warnings', 'Column headings this tool matched to a meaning but is not confident about, plus headings it could not use at all. Worth a glance: a heading matched to the wrong column would put your numbers in the wrong place.'],
  dataIssues: ['Data issues', 'Individual cells that would not read as a number, or percentages written into a column expecting a plain fraction. Each one is listed with its sheet and row so you can fix it at source.'],

  /* ── fixing ── */
  internalMatrix: ['Internal matrix', 'Whether the BRICS currencies were priced against each other using only BRICS market quotes. If dollar quotes were mixed in they would dominate — they are the deepest in any real dataset — and the rates you got out would really be dollar rates in disguise.', '§37'],
  quotesAccepted: ['Quotes accepted', 'How many of your quotes actually counted. Quotes that were too old, or that disagreed wildly with all the others, were set aside and are listed further down with the reason.', '§9'],
  weightedRMSE: ['Weighted RMSE', 'How much your quotes disagree with each other, once the best-fitting set of rates has been found. A big number means your sources do not agree; it does not mean the calculation is wrong.', '§8'],
  inputInconsistency: ['Input inconsistency', 'How badly your raw quotes contradicted themselves before fitting — if you converted A to B to C, how far off you landed from converting A to C directly. The published rates remove this entirely.', '§8'],
  perBCCT: ['Units per BCC-T', 'How much of this currency one BCC-T unit buys. This is the main table: every exchange rate between two currencies is just one of these numbers divided by another, so no third currency is ever needed to work out a pair.', '§5, §37'],
  inBCCT: ['BCC-T per unit', 'The other way round — how much of a BCC-T unit one unit of this currency buys.'],
  satelliteRole: ['Role', 'A participant is inside the system and priced along with the others. A satellite sits outside: it is priced against the group afterwards, so you can still quote and pay in it, but it has no say in the rates between the members.', '§37'],
  ownShare: ['Own share of value', 'How much of one BCC-T unit is made up of this currency itself. It is the reason a basket cannot fairly measure one of its own members: when the rupee falls, a basket containing rupees falls too, so the drop looks smaller than it was.', '§7'],

  /* ── basket ── */
  economicScore: ['Economic score', 'A blend of four things: how much of the group\'s trade this currency carries, how big its economy is, how easily it trades, and how freely it converts. Government debt is deliberately left out, so that a change of opinion about a country cannot alter what your contract is worth.', '§6, §4'],
  rawWeight: ['Raw weight', 'The share this currency would have in the basket on economics alone, before any ceiling is applied.', '§6'],
  finalWeight: ['Final weight', 'The share it actually gets. No currency may exceed the ceiling, so the largest economy cannot dominate the unit; whatever it would have had above the cap is shared out among the rest.', '§6'],
  fixedQuantity: ['Fixed quantity', 'The actual number of units of this currency inside one BCC-T — so many yuan, so many rupees. Frozen until a scheduled rebuild. This is what makes the unit safe for a long contract: nobody can quietly change what your invoice is worth.', '§5'],
  drift: ['Drift', 'How far this currency\'s real share has wandered from its intended share as rates moved. A fixed basket re-weights itself over time; that is a reason to rebuild it on a published schedule, not a reason to keep adjusting it.', '§6'],
  selfReference: ['Self-reference attenuation', 'How much of a currency\'s own movement gets hidden when you measure it against a basket that contains it. A currency holding a quarter of the basket will show only three-quarters of any fall it suffers.', '§7'],

  /* ── diagnostics ── */
  chs: ['Currency health', 'Whether the currency itself is in good shape: steady prices, manageable government debt, enough foreign reserves, sound banks. Note what is NOT here — how much the world uses the currency. That is a separate question, measured separately.', '§10'],
  coverage: ['Coverage', 'How much of the data this score needed was actually present. Hover to see the split. A missing figure is never filled in with a flattering guess — the score is reported on what exists, and this tells you how much that was.', '§15'],
  leadingIdx: ['Leading (fast)', 'Signals that move BEFORE trouble arrives: market volatility, the cost of insuring government debt, how wide the trading spreads are. Markets react first; this is what they are saying.', '§15'],
  laggingIdx: ['Lagging (slow)', 'Official statistics that confirm AFTERWARDS: debt ratios, reserve cover, the trade balance. More reliable, but often published months late.', '§15'],
  composite: ['Composite', 'The two blended according to how long you have to wait for payment. For money due next week the fast signals dominate; for money due next year the slow ones do. Move the slider above to watch the balance shift.', '§15'],
  divergence: ['Divergence', 'Fast minus slow. A large negative number means markets have already turned while the official figures still look fine. Treat it as an early warning, not a verdict — markets are sometimes wrong.', '§15'],
  band: ['Supervisory band', 'A grade from A to D that decides how much collateral this member must post and how much credit it may have. It is set from an average over several periods, not one bad month, and an upgrade needs to be clearly earned — otherwise a single wobble could cut somebody off just when they need the system.', '§25'],
  cps: ['Currency power', 'How much the world actually uses this currency — as reserves, for invoicing trade, in daily trading. Quite separate from whether it is well managed. Published annually at best, so treat it as background rather than news.', '§14'],
  excessUsage: ['Excess usage', 'How much more (or less) a currency is used internationally than its economy and markets would predict. A positive number means it punches above its weight. It is an estimate with an error range attached, not an accusation.', '§16'],

  /* ── netting ── */
  grossObligations: ['Gross obligations', 'Every bill added up, before anything is cancelled out. This is how much cash would move if each was paid separately.', '§19'],
  afterNetting: ['After netting', 'How much actually has to move once everyone\'s debts and credits are cancelled against each other in one go.', '§19'],
  compression: ['Compression', 'The share of the payments that netting removes. It is simple arithmetic and it will almost always look impressive — which is why it is not the number to judge the system by.', '§19'],
  concentration: ['Concentration', 'Whether the leftover balances are spread around or piled onto one member. Piled onto one is the failure mode a good compression figure hides.', '§19, §20'],
  persistence: ['Persistence', 'Whether the same member is left owed money every single period. If so it is steadily building up claims on everyone else, and those claims are only worth having if there is something to spend them on.', '§20, §26'],
  lag1: ['Lag-1 autocorrelation', 'Whether this period\'s balance predicts the next one. Near 1 means balances persist and build; near 0 or negative means they wash out.', '§20'],

  /* ── invoice ── */
  invoicesPriced: ['Invoices priced', 'How many trades from your file were successfully priced. Any that failed are listed with the reason.'],
  bookValue: ['Book value', 'All the invoices added together, with the plain value of the goods shown beneath for comparison.'],
  weightedSpread: ['Weighted spread', 'Everything charged on top of the goods, across the whole set, in basis points — hundredths of a percent.'],
  infraVsUsd: ['Versus the dollar route', 'How the cost of the plumbing compares with settling through dollars. The interest difference and the exchange-rate risk are left out because they are the same either way and would otherwise swamp the comparison.', '§28, §37'],
  spreadOverBase: ['Spread over base', 'Everything charged on top of what the goods are worth, in basis points. 100 basis points is 1%.'],
  oneBcct: ['One BCC-T', 'What a single BCC-T unit is worth to each side right now. Every figure on this invoice is converted with these two numbers.', '§5'],
  fxConversion: ['Conversion cost', 'What it costs to change one currency into the other — the gap between the buying and selling price. Taken from your own quotes, along the cheapest route that stays inside the group. A thinly traded pair costs more, and that is the honest obstacle here.', '§8, §28'],
  volPremium: ['Exchange-rate risk', 'The cost of the rate moving against you between agreeing the price and being paid. Hedging removes it at a price; whatever you leave unhedged is charged here. On a jumpy currency pair this is far bigger than all the fees together.', '§23'],
  nettingRebate: ['Netting rebate', 'Money handed back because netting freed up cash that would otherwise have been tied up. Counted over the few days of the settlement cycle, not the whole credit period — nobody funds the payment for the entire life of the invoice.', '§19'],
  wrongWay: ['Wrong-way loading', 'An extra credit charge when the collateral posted would lose value exactly when the member who posted it gets into trouble — a bank pledging its own government\'s bonds, for instance.', '§24'],
  dependency: ['Dollar dependency', 'Whether each of the five jobs — measuring, invoicing, converting, clearing and settling — can be done without the dollar. The count is what matters; a currency being convenient is different from it being unavoidable.', '§37'],

  /* ── workings ── */
  reconciliation: ['Reconciliation', 'The tool redoes the sum from the steps shown and checks it against the figure it published elsewhere. If they disagree it says so, instead of presenting a tidy explanation of a wrong number.'],
};

let pop = null;

function ensurePop() {
  if (pop) return pop;
  pop = document.createElement('div');
  pop.className = 'help-pop';
  document.body.append(pop);
  return pop;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function show(target, key) {
  const entry = HELP[key];
  if (!entry) return;
  const [title, body, section] = entry;
  const p = ensurePop();
  p.innerHTML = `<b>${esc(title)}</b><br>${esc(body)}${section ? `<span class="sec">${esc(section)}</span>` : ''}`;
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
