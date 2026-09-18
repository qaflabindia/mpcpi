/**
 * schema.js — the canonical workbook contract.
 *
 * One entry per sheet the tool understands. `aliases` drive fuzzy header
 * matching so a user's real spreadsheet does not have to be renamed by hand,
 * and `required` drives the validation report. Units are declared explicitly
 * because the single most common failure mode in this kind of tool is a
 * percentage silently entering a formula that expects a ratio.
 */

export const RATIO_HINT = 'ratio in [0,1] — 12% may be entered as 0.12 or "12%"';

export const SHEETS = {
  currencies: {
    label: 'Currencies',
    purpose: 'BCC-T basket constitution (§6) and participant registry.',
    key: 'code',
    columns: {
      code:                   { required: true, type: 'string', aliases: ['currency', 'ccy', 'iso', 'currency_code', 'symbol'] },
      name:                   { type: 'string', aliases: ['currency_name', 'label', 'description'] },
      country:                { type: 'string', aliases: ['participant', 'jurisdiction', 'economy', 'member'] },
      intraNetworkTradeShare: { required: true, type: 'ratio', unit: RATIO_HINT, aliases: ['intra_network_trade_share', 'trade_share', 'intra_brics_trade', 'intranetworktrade'] },
      gdpShare:               { required: true, type: 'ratio', unit: RATIO_HINT, aliases: ['gdp_share', 'gdp', 'share_of_gdp', 'economic_size'] },
      fxLiquidity:            { required: true, type: 'ratio', unit: RATIO_HINT, aliases: ['fx_liquidity', 'liquidity', 'turnover_share', 'market_liquidity'] },
      convertibility:         { required: true, type: 'ratio', unit: RATIO_HINT, aliases: ['convertibility_score', 'capital_account_openness', 'openness'] },
      policyRate:             { type: 'ratio', unit: 'annual ratio, 6.5% as 0.065', aliases: ['policy_rate', 'rate', 'interest_rate', 'repo', 'base_rate'] },
      annualVol:              { type: 'ratio', unit: 'annualised FX volatility as a ratio', aliases: ['annual_vol', 'volatility', 'fx_vol', 'sigma'] },
    },
  },

  fx_quotes: {
    label: 'FX quotes',
    purpose: 'Input to the multilateral fixing (§8). One row per executable quote.',
    columns: {
      base:      { required: true, type: 'string', aliases: ['base_currency', 'from', 'ccy1', 'buy', 'base_ccy'] },
      quote:     { required: true, type: 'string', aliases: ['quote_currency', 'to', 'ccy2', 'sell', 'quote_ccy', 'counter'] },
      rate:      { required: true, type: 'number', unit: '1 unit of base buys `rate` units of quote', aliases: ['price', 'mid', 'fx', 'mid_rate', 'exchange_rate', 'spot'] },
      bid:       { type: 'number', aliases: ['bid_price', 'bid_rate'] },
      ask:       { type: 'number', aliases: ['ask_price', 'offer', 'ask_rate'] },
      spreadBps: { type: 'number', unit: 'basis points', aliases: ['spread_bps', 'spread', 'bid_ask_bps', 'bidask'] },
      volume:    { type: 'number', unit: 'executable notional', aliases: ['notional', 'size', 'qty', 'executable_volume', 'amount'] },
      depth:     { type: 'number', unit: 'top-of-book depth', aliases: ['market_depth', 'book_depth', 'top_of_book'] },
      venueTier: { type: 'number', unit: '1 = primary venue, 3 = indicative', aliases: ['venue_tier', 'tier', 'venue', 'source_tier'] },
      ts:        { type: 'datetime', aliases: ['timestamp', 'time', 'date', 'as_of', 'datetime', 'quote_time'] },
      weight:    { type: 'number', unit: 'manual multiplier, default 1', aliases: ['manual_weight', 'override_weight'] },
    },
  },

  trades: {
    label: 'Trades',
    purpose: 'The invoices to price. One row per transaction.',
    key: 'id',
    columns: {
      id:             { required: true, type: 'string', aliases: ['trade_id', 'invoice_id', 'ref', 'reference', 'contract', 'contract_id'] },
      description:    { type: 'string', aliases: ['goods', 'item', 'product', 'narrative', 'details'] },
      exporter:       { type: 'string', aliases: ['seller', 'exporter_country', 'from_country', 'origin', 'supplier'] },
      importer:       { type: 'string', aliases: ['buyer', 'importer_country', 'to_country', 'destination', 'customer'] },
      sellerCurrency: { required: true, type: 'string', aliases: ['seller_currency', 'ccy_sell', 'invoice_currency', 'sell_ccy', 'export_currency'] },
      buyerCurrency:  { required: true, type: 'string', aliases: ['buyer_currency', 'ccy_buy', 'settlement_currency', 'buy_ccy', 'import_currency'] },
      quantity:       { type: 'number', aliases: ['qty', 'units', 'volume', 'tonnes', 'count'] },
      unitPrice:      { type: 'number', unit: 'in seller currency', aliases: ['unit_price', 'price', 'price_per_unit', 'rate_per_unit'] },
      amount:         { type: 'number', unit: 'in seller currency; overrides quantity x unitPrice', aliases: ['base_amount', 'value', 'contract_value', 'invoice_amount', 'total'] },
      settlementDays: { type: 'number', unit: 'calendar days from trade to settlement', aliases: ['settlement_days', 'tenor', 'days', 'credit_days', 'payment_terms_days', 'dso'] },
      hedgeRatio:     { type: 'ratio', unit: RATIO_HINT, aliases: ['hedge_ratio', 'hedged', 'hedge', 'fx_hedge'] },
      incoterm:       { type: 'string', aliases: ['inco', 'terms', 'delivery_terms'] },
      sector:         { type: 'string', aliases: ['industry', 'commodity', 'category', 'segment'] },
    },
  },

  fundamentals: {
    label: 'Fundamentals',
    purpose: 'BCC-D lagging block: CHS, fiscal sustainability, external resilience (§10-§13).',
    key: 'participant',
    columns: {
      participant:      { required: true, type: 'string', aliases: ['country', 'code', 'economy', 'jurisdiction', 'member'] },
      year:             { type: 'number', aliases: ['period', 'fy', 'as_of_year'] },
      inflationYoY:     { type: 'ratio', aliases: ['inflation', 'cpi', 'cpi_yoy', 'inflation_yoy', 'headline_inflation'] },
      inflationVol5y:   { type: 'ratio', aliases: ['inflation_vol', 'inflation_volatility', 'cpi_vol'] },
      debtGdp:          { type: 'ratio', aliases: ['debt_gdp', 'debt_to_gdp', 'government_debt_gdp', 'public_debt_gdp', 'gross_debt'] },
      interestRevenue:  { type: 'ratio', aliases: ['interest_revenue', 'interest_to_revenue', 'interest_expenditure_revenue', 'debt_service_ratio'] },
      primaryBalance:   { type: 'ratio', aliases: ['primary_balance', 'primary_balance_gdp', 'fiscal_balance'] },
      fxDebtShare:      { type: 'ratio', aliases: ['fx_debt_share', 'foreign_currency_debt', 'fx_share_debt', 'foreign_debt_share'] },
      avgMaturityYrs:   { type: 'number', unit: 'years', aliases: ['avg_maturity', 'average_maturity', 'maturity', 'wam'] },
      refinancingNeed:  { type: 'ratio', aliases: ['refinancing', 'refinancing_need', 'gross_financing_need', 'rollover'] },
      reserveMonths:    { type: 'number', unit: 'months of imports', aliases: ['reserve_months', 'reserve_cover', 'import_cover', 'reserves_months'] },
      stExternalDebt:   { type: 'ratio', unit: 'short-term external debt / reserves', aliases: ['st_external_debt', 'short_term_debt_reserves', 'st_debt'] },
      currentAccount:   { type: 'ratio', aliases: ['current_account', 'ca_gdp', 'current_account_gdp', 'cab'] },
      niipGdp:          { type: 'ratio', aliases: ['niip', 'niip_gdp', 'net_iip', 'net_international_investment_position'] },
      bankCapital:      { type: 'ratio', aliases: ['bank_capital', 'car', 'capital_adequacy', 'tier1'] },
      privateCreditGap: { type: 'ratio', aliases: ['credit_gap', 'credit_to_gdp_gap', 'private_credit_gap'] },
      cbIndependence:   { type: 'ratio', aliases: ['cb_independence', 'central_bank_independence', 'cbi'] },
      settlementFails:  { type: 'ratio', aliases: ['settlement_fails', 'fail_rate', 'settlement_fail_rate'] },
      realisedNetting:  { type: 'ratio', aliases: ['realised_netting', 'netting_efficiency', 'realized_netting'] },
    },
  },

  leading: {
    label: 'Leading indicators',
    purpose: 'BCC-D leading block: market signals that move before the outcome (§15).',
    key: 'participant',
    columns: {
      participant:       { required: true, type: 'string', aliases: ['country', 'code', 'currency', 'economy'] },
      asOf:              { type: 'datetime', aliases: ['as_of', 'date', 'timestamp', 'observation_date'] },
      fxVol20d:          { type: 'ratio', aliases: ['fx_vol_20d', 'vol20', 'realised_vol', 'ewma_vol', 'fx_volatility'] },
      fxCarry:           { type: 'ratio', aliases: ['fx_carry', 'carry', 'rate_differential', 'policy_differential'] },
      cds5y:             { type: 'number', unit: 'bps', aliases: ['cds', 'cds_5y', 'sovereign_cds', 'cds_spread'] },
      yieldSpread:       { type: 'number', unit: 'bps', aliases: ['yield_spread', 'sovereign_spread', 'spread_vs_median', 'bond_spread'] },
      bidAskBps:         { type: 'number', unit: 'bps', aliases: ['bid_ask_bps', 'bid_ask', 'fx_spread_bps'] },
      marketDepth:       { type: 'number', aliases: ['market_depth', 'depth', 'book_depth'] },
      quoteCount:        { type: 'number', aliases: ['quote_count', 'quotes', 'n_quotes', 'qualifying_quotes'] },
      reserveTrend3m:    { type: 'ratio', aliases: ['reserve_trend_3m', 'reserve_change', 'reserves_3m'] },
      termsOfTrade3m:    { type: 'ratio', aliases: ['terms_of_trade_3m', 'tot_momentum', 'terms_of_trade'] },
      inflationSurprise: { type: 'ratio', aliases: ['inflation_surprise', 'cpi_surprise', 'surprise'] },
      netPositionDrift:  { type: 'ratio', aliases: ['net_position_drift', 'position_drift', 'clearing_drift'] },
      fwdPointsBps:      { type: 'number', unit: 'bps', aliases: ['fwd_points_bps', 'forward_points', 'fwd_points'] },
    },
  },

  usage: {
    label: 'International usage',
    purpose: 'BCC-D Currency Power Score inputs (§14). Global shares, annual.',
    key: 'currency',
    columns: {
      currency:              { required: true, type: 'string', aliases: ['code', 'ccy', 'currency_code'] },
      year:                  { type: 'number', aliases: ['period'] },
      reserveUsage:          { type: 'ratio', unit: 'share of allocated global reserves', aliases: ['reserve_usage', 'reserve_share', 'cofer_share', 'reserves'] },
      tradeInvoicing:        { type: 'ratio', aliases: ['trade_invoicing', 'invoicing_share', 'invoicing'] },
      fxTurnover:            { type: 'ratio', aliases: ['fx_turnover', 'turnover_share', 'bis_turnover'] },
      internationalDebt:     { type: 'ratio', aliases: ['international_debt', 'intl_debt_share', 'debt_securities'] },
      crossBorderSettlement: { type: 'ratio', aliases: ['cross_border_settlement', 'settlement_share', 'swift_share', 'messaging_share'] },
      marketDepth:           { type: 'number', unit: 'regressor for §16', aliases: ['market_depth', 'depth_index', 'financial_depth'] },
      tradeScale:            { type: 'number', unit: 'regressor for §16', aliases: ['trade_scale', 'trade_size', 'world_trade_share'] },
    },
  },

  obligations: {
    label: 'Obligations',
    purpose: 'Bilateral payment obligations for the netting engine (§19-§20).',
    columns: {
      period:   { type: 'string', aliases: ['month', 'quarter', 'date', 'settlement_period'] },
      from:     { required: true, type: 'string', aliases: ['payer', 'debtor', 'from_participant', 'origin'] },
      to:       { required: true, type: 'string', aliases: ['payee', 'creditor', 'to_participant', 'destination'] },
      amount:   { required: true, type: 'number', aliases: ['value', 'notional', 'obligation', 'payable'] },
      currency: { type: 'string', aliases: ['ccy', 'denomination', 'currency_code'] },
      sector:   { type: 'string', aliases: ['category', 'commodity', 'industry'] },
    },
  },

  participants: {
    label: 'Participants',
    purpose: 'Supervisory bands (§25), collateral (§24) and legal readiness (§21).',
    key: 'participant',
    columns: {
      participant:          { required: true, type: 'string', aliases: ['country', 'code', 'member', 'institution'] },
      sustainabilityHistory:{ type: 'list', unit: 'semicolon or comma separated scores, oldest first', aliases: ['sustainability_history', 'score_history', 'band_history', 'history'] },
      currentBand:          { type: 'string', unit: 'A | B | C | D', aliases: ['current_band', 'band', 'supervisory_band'] },
      collateralClass:      { type: 'string', aliases: ['collateral_class', 'class', 'collateral_type'] },
      collateralIssuer:     { type: 'string', aliases: ['collateral_issuer', 'issuer'] },
      collateralValue:      { type: 'number', aliases: ['collateral_value', 'market_value', 'collateral'] },
      nettingOpinion:       { type: 'bool', aliases: ['netting_opinion', 'netting_enforceable', 'legal_netting'] },
      settlementFinality:   { type: 'bool', aliases: ['settlement_finality', 'finality'] },
    },
  },
};

export const SHEET_ALIASES = {
  currencies: ['currency', 'ccy', 'basket', 'basket_currencies', 'components'],
  fx_quotes: ['fx', 'quotes', 'rates', 'fx_rates', 'market_quotes', 'prices', 'fxquotes'],
  trades: ['trade', 'invoices', 'invoice', 'transactions', 'contracts', 'orders', 'shipments'],
  fundamentals: ['macro', 'fundamental', 'lagging', 'structural', 'country_data', 'economics'],
  leading: ['leading_indicators', 'market', 'signals', 'high_frequency', 'indicators'],
  usage: ['cps', 'international_usage', 'currency_power', 'usage_shares', 'power'],
  obligations: ['netting', 'flows', 'trade_matrix', 'positions', 'payments', 'bilateral'],
  participants: ['members', 'counterparties', 'banks', 'institutions', 'collateral'],
};

/** Every canonical column name, for the column-mapping UI. */
export const ALL_COLUMNS = Object.fromEntries(
  Object.entries(SHEETS).map(([k, s]) => [k, Object.keys(s.columns)]),
);
