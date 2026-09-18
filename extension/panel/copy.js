/**
 * copy.js — what each screen says, in ordinary English.
 *
 * Two layers, deliberately.
 *
 *   plain    What this is for and what you are looking at. No jargon. If a
 *            term cannot be avoided it is explained the first time it appears.
 *            Someone who has never read the paper should be able to follow it.
 *
 *   precise  The exact technical statement, for a reader who wants it and for
 *            anyone checking the implementation against the framework. Hidden
 *            behind a toggle so it never stands between a newcomer and the
 *            screen.
 *
 * Writing the precise version FIRST and hoping readers would cope was the
 * original mistake. Both audiences are real; only one of them was served.
 */

export const SECTIONS = {
  data: {
    title: 'Load your data',
    plain: [
      'This tool works out what a cross-border invoice should cost when it is settled between two BRICS currencies directly, instead of being converted through US dollars on the way.',
      'Give it a spreadsheet — a Google Sheet or an Excel file — with your exchange-rate quotes, your trades, and some background figures about each country. It reads the column headings loosely, so "Payment Terms Days", "settlement_days" and "tenor" all land in the same place. Anything it is unsure about it tells you rather than guessing quietly.',
      'If you just want to see what it does, load the sample.',
    ],
    precise: 'Ingests xlsx/csv/Google Sheets into the canonical tables of `core/schema.js` by fuzzy header matching, reporting every mapping below 85% confidence and every cell-level coercion. Column units follow the data dictionary requirement of §15.',
  },

  fixing: {
    title: 'Working out the exchange rates',
    plain: [
      'Exchange rates from different sources rarely agree with each other. Suppose you buy rupees with yuan, then reais with those rupees. You ought to end up with the same amount as if you had bought reais with yuan directly — but quoted rates usually leave a small gap, and somebody always ends up paying it.',
      'This page closes that gap. Rather than storing a separate rate for every pair of currencies, it works out a single value for each currency — think of it as a price tag — and then every exchange rate is simply one price tag divided by another. Round trips cannot leak, because there is nothing left for the rates to disagree about.',
      'The quotes you supply are not treated equally. A large, tightly-priced, recent quote from a major venue counts for more than a small, wide, stale one. A quote that disagrees wildly with everything else is set aside and listed, so you can see what was ignored and why.',
      'The dollar is deliberately kept out of this calculation and priced afterwards. That matters: if dollar quotes were included they would dominate, because they are the deepest in any real dataset — and the "BRICS rates" you got out would really just be dollar rates wearing a different label.',
    ],
    precise: 'One shadow log-price per currency, estimated jointly by weighted least squares, so FX_ij · FX_jk = FX_ik holds by construction rather than by luck (§8). The participating network is fitted alone; the vehicle currency is attached afterwards as a satellite and cannot move the internal matrix (§37).',
  },

  basket: {
    title: 'Building the BCC-T unit',
    plain: [
      'BCC-T is a made-up unit of account — a yardstick for pricing contracts, in the way that a shipping container is a standard unit of cargo. It is not money and nobody issues it. It is simply a fixed shopping basket of the member currencies.',
      'Each currency\'s share is decided by how much of the group\'s trade it carries, how big its economy is, how easily it trades, and how freely it converts. No single currency is allowed more than a set ceiling, so the largest economy cannot dominate the unit; anything above the ceiling is shared out among the others.',
      'Once the basket is set, the QUANTITIES are frozen — so many yuan, so many rupees, and so on — until a scheduled rebuild. That is what makes the unit trustworthy for a long contract: nobody can change what your invoice is worth by revising an opinion about a country.',
      'One consequence worth understanding: a basket that contains a currency cannot fairly measure that currency, because when the rupee falls the basket falls with it. The table at the bottom shows exactly how much of a movement gets hidden this way.',
    ],
    precise: 'A fixed quantity vector, capped and redistributed (§6). Quantities change only at a scheduled reconstitution — never because a diagnostic moved (§4). Self-reference attenuation is (1 − w_i) per §7.',
  },

  diagnostics: {
    title: 'How each country is doing',
    plain: [
      'Two different questions get confused all the time, so this page keeps them apart.',
      'The first is whether a currency is in good shape: steady prices, manageable government debt, enough foreign reserves, sound banks. The second is how much the world actually USES that currency. They are not the same thing — the dollar is used enormously despite large US debts, and a well-run small economy can have a currency almost nobody holds.',
      'The indicators are also split by speed. FAST ones — market prices, volatility, the cost of insuring government debt — move before trouble arrives. SLOW ones — debt ratios, reserve cover, the current account — confirm it afterwards, sometimes a year later. For a payment due next week the fast ones matter more; for one due next year the slow ones do. The slider lets you see that trade-off change.',
      'When the fast indicators have dropped and the slow ones have not caught up, that gap is flagged. It is an early warning, not a verdict.',
    ],
    precise: 'CHS (§10) and CPS (§14) are measured separately. Indicators are scored against fixed reference distributions, never cross-sectional min-max (§11). The composite is horizon-weighted, w_L(T) = exp(−T/τ), with divergence reported separately (§15).',
  },

  netting: {
    title: 'Settling everyone at once',
    plain: [
      'If five countries all owe each other money, paying every bill separately moves an enormous amount of cash for very little net effect. Netting is the obvious fix: add up what each one owes and is owed, and move only the difference.',
      'The top figures show how much that saves. Be careful with them, though — the saving is just arithmetic, and it is not the interesting part.',
      'The interesting part is who is left holding a balance, month after month. If the same country is always owed money at the end, it is steadily accumulating claims on the others. Those claims are only worth having if they can be spent or invested somewhere. A system that quietly turns one member into a permanent creditor of everyone else has a problem no amount of netting efficiency will fix.',
      'The stress buttons cut particular flows to see whether the leftover balances pile onto fewer participants when things go wrong — which is exactly when you least want that.',
    ],
    precise: 'Multilateral compression is an accounting identity (§19). What decides the design is the size and persistence of residual creditor balances (§20) and the §26 asset layer they require. Stress scenarios follow §20.7.',
  },

  invoice: {
    title: 'What the invoice costs',
    plain: [
      'This is the point of the whole tool. It takes one trade and shows every charge that sits on top of the value of the goods, with nothing bundled into a vague "fee".',
      'Some of those charges have nothing to do with how the payment is routed: the interest difference between the two currencies over the time until payment, and the risk that the exchange rate moves before the money arrives. Those are the same whichever way you settle, and on a volatile currency pair they are much larger than everything else put together.',
      'The rest are the cost of the plumbing — converting the money, covering the risk that the buyer does not pay, fees, and the credit you get back from netting. Those DO depend on routing, and they are what the comparison on the right is about.',
      'The comparison prices the same trade the ordinary way, converting through dollars, and charges that route honestly too: two conversions instead of one, two banks in the middle, and the risk of paying out before you are paid because there is nothing guaranteeing the two legs happen together. Whichever comes out cheaper is what the tool reports.',
    ],
    precise: 'An additive decomposition over the BCC-T numeraire, separating route-independent carry and FX risk (§23) from route-specific infrastructure. The incumbent route is priced with correspondent credit, principal risk from the absence of PvP (§18) and nostro float.',
  },

  workings: {
    title: 'Show me the arithmetic',
    plain: [
      'Every number on the other screens is worked out again here, one step at a time: the formula, the actual numbers put into it, and what comes out. You can follow it with a calculator if you want to.',
      'At the top of each derivation there is a check. The tool recomputes the answer from the steps shown and compares it against the figure it published elsewhere. If the two ever disagree, it says so in red rather than quietly showing you a tidy explanation of a wrong number.',
      'That check matters more than it looks. An explanation that cannot possibly be wrong is not evidence of anything.',
    ],
    precise: 'Each chain recomputes from recorded inputs and reconciles against the published figure, allowing half a unit in the last published decimal place. Mismatches report the difference and the allowance. This is the replicability §5 demands of BCC-T, applied to every figure the tool publishes.',
  },

  agent: {
    title: 'Ask questions about your data',
    plain: [
      'A conversational assistant that can read the results and explain them. It does not do the maths itself — it calls the same functions the screens use and reports what comes back, so it cannot invent a number.',
      'It needs an account with a model provider, which you set up under the gear icon. Everything else in this tool works without one.',
    ],
    precise: 'Provider-agnostic tool-calling loop with a per-turn context budget. Tool results are the only source of figures; MCP results are treated as untrusted data. The agent reads the §10–§16 diagnostics and the invoice decomposition through tools rather than recomputing them.',
  },
};

/** A term people meet on these screens and may not know. */
export const GLOSSARY = {
  'basis point': 'One hundredth of one percent. 100 basis points = 1%. Used because the differences here are small and "0.05%" is easy to misread.',
  'BCC-T': 'The made-up unit of account this tool prices in: a fixed basket of the member currencies. A yardstick, not money.',
  'fixing': 'The act of setting an official exchange rate at a particular moment, from the quotes available then.',
  'quote': 'A price someone is actually willing to trade at, as opposed to an indicative or historical rate.',
  'spread': 'The gap between the buying and selling price. It is what it costs you to convert, and it is why a round trip loses money even if the rate never moves.',
  'the vehicle currency': 'A currency used as a stepping stone between two others — today, almost always the US dollar. Brazil and India trading with each other will typically convert real → dollar → rupee.',
  'settlement': 'The moment money actually changes hands, which is usually days or months after the deal is agreed.',
  'netting': 'Cancelling out what people owe each other so only the difference is paid.',
  'hedge': 'Locking in an exchange rate in advance so a later movement cannot hurt you. It costs something, which is why not everyone hedges everything.',
  'counterparty': 'The other side of the deal — the person or institution who owes you.',
  'central counterparty (CCP)': 'An institution that steps between buyer and seller so each faces it rather than each other, holds collateral from both, and absorbs the loss if one fails.',
  'collateral': 'Assets pledged up front so that if someone fails to pay, there is something to seize.',
  'haircut': 'A discount applied to pledged collateral, because its value may fall before it can be sold.',
  'wrong-way risk': 'When the collateral is worth least exactly when you need it most — for example a government\'s own bonds pledged by a bank in that country.',
  'payment-versus-payment (PvP)': 'A mechanism where the two halves of a currency exchange happen together or not at all. Without it, one side can pay and then find the other has failed.',
  'supervisory band': 'A grade (A to D) that decides how much collateral a member must post and how much unsecured credit it may have.',
  'volatility': 'How much a price moves about. Higher volatility means more can go wrong between agreeing a price and being paid.',
  'leading indicator': 'A measure that moves before the thing you care about — market prices usually react first.',
  'lagging indicator': 'A measure that confirms afterwards — official statistics, published months later.',
};
