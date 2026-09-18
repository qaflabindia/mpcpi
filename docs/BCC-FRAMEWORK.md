---
title: "A BRICS Transaction Unit and Diagnostic Framework for Multipolar Currency Settlement"
subtitle: "\"Death of the Dollar\" as the End of Mandatory Dollar Intermediation"
type: conceptual-institutional-design
status: research-proposal
implements: BCC-T / BCC-C / BCC-D
saved: 2026-09-18
keywords: [BRICS, international currency, dollar, reserve currency, sovereign debt, multilateral clearing, exchange rates, local-currency settlement, currency invoicing, financial market infrastructure]
---

# A BRICS Transaction Unit and Diagnostic Framework for Multipolar Currency Settlement

**"Death of the Dollar" as the End of Mandatory Dollar Intermediation**

## Abstract

The international monetary system assigns several functions simultaneously to the United States dollar: national currency, reserve asset, vehicle currency, trade-invoicing unit, settlement instrument and reference point for the valuation of other currencies. These functions are supported by deep financial markets, liquidity, legal infrastructure and powerful network effects. They also create an asymmetry in which a sovereign national currency functions as a global monetary intermediary even when the underlying transaction does not involve the United States.

This paper develops a conceptual institutional architecture for reducing that dependency without proposing the immediate replacement of national currencies or the creation of a common BRICS retail currency. It introduces three analytically distinct components. **BCC-T** is a fixed-composition BRICS transaction unit used as a replicable unit of account. **BCC-C** is a strictly collateralised and primarily intraday clearing claim used within an institutional settlement mechanism. **BCC-D** is a diagnostic framework used to evaluate currency fundamentals, sovereign debt sustainability and international currency usage. The three components are deliberately separated so that changing assessments of national debt or monetary fundamentals cannot alter the value of outstanding contracts denominated in BCC-T.

The paper further proposes a cross-currency fixing methodology based on jointly estimated currency shadow prices rather than independent bilateral medians, thereby ensuring triangular consistency across the foreign-exchange matrix. Currency health and currency power are measured separately. Sovereign debt sustainability enters the diagnostic framework and supervisory credit architecture, but does not enter the transactional basket. The paper replaces a mechanically constructed "Privilege Gap" with an econometrically estimable excess-international-usage measure derived from the residual relationship between international currency use and monetary fundamentals.

The settlement proposal is designed around the Principles for Financial Market Infrastructures, including enforceable multilateral netting, settlement finality, collateral rules, default management and payment-versus-payment settlement. Historical precedents including the European Payments Union, European Currency Unit, transferable rouble, Latin American local-currency payment arrangements and the IMF Special Drawing Right are used to identify both viable design elements and recurrent failure modes.

This is explicitly a conceptual and institutional design paper rather than an empirical demonstration of netting efficiency. The framework therefore identifies the empirical tests required before implementation, including bilateral trade-flow simulation, liquidity estimation, historical calibration of sovereign-risk indicators and estimation of currency network effects.

The central proposition is narrow. "Death of the Dollar" does not require the disappearance or administrative depreciation of the dollar. It refers to the creation of an international monetary architecture in which the dollar ceases to be *technically indispensable* for measurement, invoicing, foreign-exchange conversion, clearing and settlement.

**Keywords:** BRICS, international currency, dollar, reserve currency, sovereign debt, multilateral clearing, exchange rates, local-currency settlement, currency invoicing, financial market infrastructure.

---

## 1. Introduction

The international monetary system combines sovereign national currencies with a highly concentrated global monetary network. The US dollar remains the principal reserve currency and is widely used in cross-border banking, international securities, trade invoicing and foreign-exchange transactions.

According to the IMF Currency Composition of Official Foreign Exchange Reserves database, the dollar represented 57.13 per cent of allocated global foreign-exchange reserves in the first quarter of 2026. The IMF also notes that exchange-rate valuation effects contributed materially to the quarter-to-quarter increase in this share.

Dollar prominence is not merely the result of convention. It is supported by the scale and liquidity of US capital markets, the supply of dollar-denominated financial assets and strong network externalities. The dominant-currency literature demonstrates that the dollar plays an unusually large role in international trade pricing and transmission even when the United States is not one of the trading counterparties. Gopinath et al. find that dollar movements can materially influence trade between third countries, while Gopinath and Itskhoki emphasize the persistence created by complementary currency choices among firms.

This produces a distinction between **monetary usefulness** and **monetary necessity**.

A Brazilian exporter and an Indian importer may rationally choose the dollar because dollar markets are more liquid and easier to hedge. That is an economic choice.

A different problem arises when no sufficiently credible infrastructure exists through which the same parties can efficiently invoice, convert and settle their transaction without introducing the currency of a third sovereign economy.

The purpose of this paper is therefore not to demonstrate that the dollar is intrinsically mispriced. It is to investigate the institutional requirements for creating an alternative monetary pathway.

The relevant question is:

> Can sovereign economies create a multilateral monetary infrastructure in which currencies can be measured, contracts denominated, cross-rates discovered, obligations netted and final payments settled without requiring the US dollar as the mandatory intermediary?

## 2. Relation to the Literature

The proposal sits at the intersection of four established literatures.

The first concerns **dominant international currencies**. The dominant-currency paradigm explains why one currency can acquire a disproportionate role in trade invoicing and why network complementarities make that role persistent.

The second concerns **international reserve-currency status**. Chinn and Frankel identify economic scale, inflation or depreciation performance, exchange-rate variability and financial-market depth as important determinants of reserve-currency usage and explicitly model the possibility of tipping effects arising from network externalities.

The third concerns what has traditionally been termed the United States' **"exorbitant privilege."** Gourinchas and Rey document differences between returns on US foreign assets and liabilities and show how the international balance sheet of the United States can generate advantages beyond simple reserve holdings.

The fourth concerns the role of **currency denomination in international portfolio allocation**. Maggiori, Neiman and Schreger show that currency denomination is itself an important determinant of international capital allocation and that dollar-denominated securities occupy a distinctive position in global portfolios.

The contribution of the present framework is therefore not the discovery that international currencies possess network advantages. Rather, it proposes an institutional decomposition of three functions that are frequently conflated: the transaction numeraire, the settlement asset and the statistical assessment of monetary fundamentals.

## 3. Historical and Institutional Precedents

The idea of a supranational unit of account or multilateral clearing architecture is not new.

The **European Payments Union** provides one of the most important historical precedents. Created in 1950, it allowed European economies to report bilateral positions to the Bank for International Settlements, after which positions were aggregated and settled on a multilateral basis. The system reduced the need to settle every bilateral transaction immediately in scarce hard currency. By 1958, current-account convertibility had been restored and the EPU was dissolved.

The EPU demonstrates the potential benefits of multilateral netting. It also demonstrates that such a system requires institutional capital, adjustment rules and credible settlement arrangements; it did not operate merely through arithmetic.

The **European Currency Unit** provides a second precedent. The ECU was defined as fixed quantities of European currencies and was used in both official and private financial markets. Commercial banks developed ECU-denominated assets and liabilities, and ECU bonds emerged in private capital markets. BIS historical work shows that a substantial ECU securities market developed before the transition to the euro.

The **transferable rouble** provides a contrasting lesson. CMEA transactions were accounted for through transferable-rouble accounts, but the unit suffered from restricted transferability and weak convertibility. IMF historical analysis notes that creditor balances could not necessarily be used freely against third-country deficits, encouraging bilateral rather than genuinely multilateral balancing.

**Latin America** provides smaller contemporary examples. Brazil's Local Currency Payment System permits transactions with Argentina, Paraguay and Uruguay to be settled directly in local currencies without requiring an intermediary reserve currency such as the dollar. The Central Bank of Brazil explicitly identifies lower transaction costs and the removal of an intermediary currency as objectives of the system.

CEPAL has similarly documented ALADI, SML and SUCRE as regional arrangements employing combinations of multilateral compensation, local currencies and common accounting units.

These experiences suggest that the difficult problem is not the invention of a synthetic unit. The difficult problem is constructing liquidity, convertibility, governance, legal finality and investable assets around it.

## 4. Three Separate Components

The framework proposed here deliberately separates three functions.

### BCC-T — BRICS Currency Credit, Transaction Unit

BCC-T is a fixed-composition basket and contractual numeraire.

- It is **not** a debt instrument.
- It is **not** issued by a government.
- It is **not** a liability of the New Development Bank.
- It does **not** change when a sovereign credit score changes.

### BCC-C — BRICS Currency Credit, Clearing Claim

BCC-C is a temporary, collateralised claim used only inside the clearing infrastructure. It exists because multilateral settlement may require temporary liquidity between the moment obligations are netted and the moment final settlement occurs. BCC-C is therefore a balance-sheet instrument.

### BCC-D — BRICS Currency Diagnostics

BCC-D consists of statistical measures such as Currency Health Score, Debt Sustainability Score, Currency Power Score and estimated international-usage residuals. BCC-D is **not** part of the contractual definition of BCC-T.

> This separation is essential. A five-year commercial contract cannot reasonably be denominated in a unit whose composition changes because a statistical committee changes its assessment of one country's fiscal position. Debt sustainability may affect collateral haircuts, credit limits and risk monitoring. It must not retroactively alter the ruler.

## 5. Definition of BCC-T

BCC-T is defined as a fixed quantity vector of participating currencies.

```
BCC_T = q1·C1 + q2·C2 + q3·C3 + ... + qN·CN
```

Where:

| Symbol | Meaning |
|---|---|
| `Ci` | participating currency *i* |
| `qi` | fixed quantity of currency *i* in the basket |
| `N`  | number of component currencies |

The value of BCC-T in currency K is:

```
BCC_T_Value_K = SUM[i=1..N]( qi * FX_iK )
```

The quantities `qi` remain constant between scheduled reconstitutions.

The principle is similar to a replicable financial index. Any participating bank should be able to reproduce the value independently from published currency quantities and published exchange rates.

A base value may be established as:

```
BCC_T_Base = 100
```

This is an index number rather than a dollar value.

## 6. Basket Composition

The initial basket quantities require a mechanical rule. A possible preliminary economic-weight formula is:

```
EconomicScore_i = 0.40·IntraNetworkTradeShare_i
                + 0.30·GDPShare_i
                + 0.15·FXLiquidity_i
                + 0.15·Convertibility_i
```

The weighting formula intentionally excludes debt sustainability and discretionary political assessments.

Weights are normalized:

```
RawWeight_i = EconomicScore_i / SUM[j=1..N]( EconomicScore_j )
```

A concentration ceiling can then be imposed. For example:

```
MaximumWeight = 0.25
CappedWeight_i = MIN(RawWeight_i, MaximumWeight)
```

Any excess is redistributed proportionately among uncapped currencies until:

```
SUM[i=1..N]( FinalWeight_i ) = 1
FinalWeight_i <= MaximumWeight
```

The appropriate cap is ultimately a governance choice rather than an economic constant. The important design criterion is predictability. Reconstitution should occur according to a publicly specified calendar, for example every two years, with methodology announced in advance.

## 7. Self-Reference and Currency-Strength Measurement

A common basket containing INR cannot simultaneously provide a perfectly independent measurement of INR.

If INR represents 20 per cent of BCC-T, then INR/BCC-T contains an INR/INR component. A genuinely idiosyncratic INR shock will therefore be mechanically attenuated.

BCC-T and currency-strength measurement must consequently remain separate. The common BCC-T remains useful for contracts and multilateral accounting. For diagnostic currency performance, an **own-currency-excluded index** should be published.

For currency *i*:

```
FX_Strength_i(t) = 100 * EXP( SUM[j != i]( w_ij * LN( FX_ij(t) / FX_ij(base) ) ) )
```

Subject to:

```
SUM[j != i]( w_ij ) = 1
```

The basket used to evaluate currency *i* therefore excludes currency *i* itself. This is conceptually similar to an effective exchange-rate index. An INR shock is measured against a basket containing the other currencies, not against a basket partly containing INR.

## 8. The Multilateral FX Fixing

The cross-rate matrix must be internally consistent. Independent bilateral medians are inadequate because independently estimated INR/CNY, CNY/BRL and INR/BRL rates can violate triangular consistency.

A consistent-by-construction method is preferable.

For each fixing window, observed quotes `q` contain a currency pair `i(q), j(q)`, an observed exchange rate `FX_obs,q` and a quote reliability weight `w_q`.

The fixing estimates one shadow log-price `p_i` for every participating currency by minimizing:

```
Objective = SUM[q] w_q * [ LN(FX_obs,q) - (p_i(q) - p_j(q)) ]^2
```

One normalization is imposed because only relative prices matter, for example:

```
p_1 = 0        or        SUM[i] p_i = 0
```

After estimation:

```
FX_ij = EXP( p_i - p_j )
```

This guarantees:

```
FX_ij * FX_jk = FX_ik
FX_ji = 1 / FX_ij
```

by construction.

The quote weights `w_q` should be mechanical functions of executable volume, bid-ask spread, market depth, quote age and venue quality.

## 9. Fixing Governance

A credible fixing requires more than an equation.

- The fixing window must be predetermined. For example, a reference window could contain all qualifying executable quotations submitted during a defined thirty-minute interval.
- Each currency must satisfy a minimum number of independent qualifying quotations.
- Quotes older than the specified staleness threshold are rejected.
- Obvious data errors and statistically extreme deviations from the preliminary fitted matrix are subject to mechanical outlier rules.

The hierarchy for insufficient data should be predetermined. A possible fallback hierarchy is:

1. Direct executable market quotes;
2. Synthetic cross-rates derived from qualifying participant-currency markets;
3. The most recent valid official fixing for a limited disruption period;
4. A formally declared market disruption event.

Outstanding contracts must contain a market-disruption clause describing how payment amounts are calculated if a fixing cannot be produced. This is a contractual requirement, not merely an operational detail.

## 10. Currency Diagnostics

The diagnostic framework should measure distinct economic concepts without double counting. The Currency Health Score is therefore redesigned around four broad dimensions:

1. Price Stability
2. Fiscal Sustainability
3. External Resilience
4. Monetary-Financial Resilience

Each sub-index is constructed from variables that do not appear elsewhere in the same composite whenever practicable. An illustrative formulation is:

```
CHS_i = 0.25·PriceStability_i
      + 0.30·FiscalSustainability_i
      + 0.30·ExternalResilience_i
      + 0.15·MonetaryFinancialResilience_i

0 <= CHS_i <= 100
```

International usage is deliberately excluded from CHS. Currency health and currency internationalisation are separate phenomena.

## 11. Normalisation

Cross-sectional min-max normalisation should not be used. If one country becomes an extreme outlier, min-max scaling changes every other country's score even when nothing has changed in those economies.

A fixed reference distribution is preferable. For variable `x`:

```
x_w  = Winsorize(x, fixed lower and upper thresholds)
z_x  = (x_w - Mean_reference) / SD_reference
```

Where the reference mean, standard deviation and winsorisation thresholds are calculated from a fixed calibration sample and are not changed every year.

The score transformation may be:

```
Score_x = CLAMP( 50 + Direction_x * 10 * z_x, 0, 100 )
```

- `Direction_x = +1` when higher values represent stronger fundamentals.
- `Direction_x = -1` when higher values represent greater risk.

A score in 2035 therefore retains approximately the same interpretation as a score in 2027.

## 12. Fiscal Sustainability

The fiscal component should not rely on nominal sovereign debt. A large nominal debt stock in a large economy is not directly comparable with a smaller nominal debt stock in a smaller economy.

The fiscal sustainability block may include:

- Government debt / GDP
- Interest expenditure / government revenue
- Primary fiscal balance / GDP
- Foreign-currency share of sovereign debt
- Average debt maturity
- Near-term refinancing requirement / government revenue

The diagnostic relationship may be written:

```
FiscalRisk_i = f( DebtGDP_i, InterestRevenue_i, PrimaryBalance_i,
                  FXDebtShare_i, Refinancing_i, Maturity_i )

FiscalSustainability_i = 100 - NormalizedFiscalRisk_i
```

Debt denominated in the sovereign's own currency is not assigned the same risk as foreign-currency debt because the latter introduces an additional currency mismatch. Debt sustainability therefore matters materially, but it does not determine BCC-T basket composition.

## 13. External Resilience

External resilience should contain the external variables that were previously spread across multiple indices. A possible formulation is:

```
ExternalResilience_i = f( ReserveCoverage_i, ShortTermExternalDebt_i,
                          CurrentAccount_i, NIIP_i )
```

Reserve adequacy appears here and not again inside the fiscal block. Net international investment position appears here and not again elsewhere. This removes the hidden double counting present in earlier versions of the model.

## 14. Currency Power

The Currency Power Score measures international usage rather than monetary health. A conceptual formulation is:

```
CPS_i = 0.25·ReserveUsage_i
      + 0.25·TradeInvoicing_i
      + 0.20·FXTurnover_i
      + 0.15·InternationalDebt_i
      + 0.15·CrossBorderSettlement_i
```

The variables and weights remain subject to data availability.

The distinction is essential. A currency can possess strong fiscal and monetary fundamentals but little international use. Another currency can have substantial international use despite weaker fiscal fundamentals because incumbent network effects, liquidity and existing financial infrastructure reinforce its position.

International currency power is therefore an economic phenomenon in its own right rather than simply a reward assigned mechanically to the healthiest sovereign balance sheet.

## 15. Data Limitations

The CPS cannot credibly be described as a high-frequency index. Several international-use variables are published with substantial lags, incomplete country coverage or proprietary restrictions.

The framework should therefore distinguish between daily market indicators and annual structural diagnostics.

| Measure | Practical frequency |
|---|---|
| BCC-T | daily |
| Own-currency-excluded FX strength | daily |
| CHS | quarterly or annual, depending on inputs |
| CPS | initially an annual research statistic |

Each data series should have a published data dictionary specifying: source; frequency; publication lag; country coverage; revision policy; missing-data procedure.

Where a component is unavailable, the system should not silently impute a favorable score. Either a transparent statistical imputation rule should be used or the composite should be reported with reduced coverage and an explicit confidence flag.

## 16. From "Privilege Gap" to Estimated International-Usage Premium

Subtracting CPS from CHS is not statistically meaningful because both are constructed 0–100 indices with arbitrary scaling.

A more defensible approach estimates the level of international currency use predicted by fundamentals and market structure. For currency *i* in year *t*:

```
CPS_it = alpha + beta·CHS_it + gamma·MarketDepth_it + delta·TradeScale_it + tau_t + epsilon_it
```

Where `tau_t` represents year effects. The baseline estimated excess-use measure is:

```
ExcessUsage_it = epsilon_it
```

A positive value means that international use exceeds that predicted by the observed fundamentals and structural market variables.

A second specification may include currency fixed effects:

```
CPS_it = alpha + beta·CHS_it + gamma·Z_it + mu_i + tau_t + epsilon_it
```

The currency effect `mu_i` captures persistent currency-specific advantages or disadvantages not explained by the measured fundamentals. The residual `epsilon_it` captures temporary deviations from that structural position.

The estimated residual must be published with standard errors and confidence intervals. This converts the proposition of an international currency premium into a falsifiable statistical statement.

The resulting measure complements, rather than replaces, the established literature on exorbitant privilege. Gourinchas and Rey's work focuses importantly on the return structure of US external assets and liabilities; the present measure focuses on international usage conditional on monetary fundamentals and market structure.

## 17. Why US Debt and Dollar Power Can Coexist

The coexistence of high US public debt and strong dollar international usage is not logically contradictory.

Currency power depends on more than public debt. It also depends on financial-market depth, liquidity, institutional credibility, availability of safe and tradable assets, international invoicing conventions and network effects. A large sovereign bond market can itself increase monetary utility because it supplies a large pool of assets that global institutions can hold and trade.

The analytical question is therefore not:

> "How can a highly indebted country have a powerful currency?"

The appropriate question is:

> "How much international usage would the currency be expected to command after controlling for fiscal sustainability, liquidity, market depth, institutional features and incumbent network effects?"

That is precisely the function of the proposed excess-usage framework. It permits the existence and magnitude of a dollar network premium to be estimated rather than asserted.

## 18. BCC-C: The Clearing Claim

BCC-T is not a liability. BCC-C is.

BCC-C should be a strictly institutional clearing claim issued by a designated BRICS Clearing Corporation (BCCC) against qualifying collateral or prefunded settlement assets.

A simplified balance sheet at issuance is:

| Entity | Entry |
|---|---|
| BCCC assets | +100 eligible collateral or settlement assets |
| BCCC liabilities | +100 BCC-C |
| Settlement member assets | +100 BCC-C |
| Settlement member | collateral becomes pledged or restricted |

BCC-C should primarily exist intraday. The preferred final settlement model should use participating central-bank money wherever practical, consistent with established principles for financial market infrastructures.

BIS / CPMI-IOSCO standards explicitly emphasize strong legal foundations, settlement finality, credit-risk controls, central-bank money where practical and payment-versus-payment protection for linked obligations.

## 19. Netting

For participant *i*:

```
NetPosition_i = TotalBCCReceivables_i - TotalBCCPayables_i
```

Across a closed clearing system:

```
SUM[i=1..N]( NetPosition_i ) = 0
```

Gross payment obligations are:

```
GrossSettlement = SUM( all bilateral obligations )
```

The minimum amount that must change hands after complete multilateral netting is:

```
NetSettlement = 0.5 * SUM[i=1..N]( ABS( NetPosition_i ) )

LiquiditySaving         = GrossSettlement - NetSettlement
LiquiditySavingPercent  = 100 * LiquiditySaving / GrossSettlement
```

These equations describe accounting compression. They do not prove that actual BRICS trade would produce large liquidity savings. That is an empirical question. If bilateral flows are highly asymmetric or concentrated around one hub economy, residual net positions can remain large even after multilateral netting.

## 20. Required Empirical Netting Test

Before BCC-C is proposed for implementation, bilateral merchandise and services flows should be reconstructed at monthly or quarterly frequency. For every period:

1. Construct the matrix of eligible bilateral trade obligations.
2. Convert eligible positions into BCC-T using the fixing methodology.
3. Calculate gross bilateral obligations.
4. Apply multilateral netting.
5. Calculate residual creditor and debtor positions.
6. Measure the distribution and persistence of those positions.
7. Stress the matrix against commodity shocks, exchange-rate shocks and trade disruptions.

The key empirical output is not simply average netting efficiency. The crucial variables are the size and persistence of residual creditor balances. If compression is weak, the investable creditor-asset layer becomes the central economic problem rather than a secondary feature.

## 21. Legal Finality

Multilateral netting has value only if it survives insolvency. The clearing architecture should therefore require legally enforceable netting in every participating jurisdiction before the relevant institution is admitted as a settlement member.

International PFMI standards require a clear and enforceable legal basis for financial market infrastructure and emphasize that netting and settlement finality must not be vulnerable to reversal under insolvency rules.

Each jurisdiction should therefore provide an independent legal opinion addressing:

- enforceability of multilateral netting;
- settlement finality;
- collateral security interests;
- insolvency treatment;
- resolution stays;
- recognition of foreign clearing rules;
- conflict-of-law questions.

Phase III clearing should not begin in a jurisdiction until these conditions are satisfied.

## 22. Default Waterfall

The clearing entity requires an explicit default waterfall. A reasonable conceptual sequence is:

1. Defaulter variation margin
2. Defaulter initial margin
3. Defaulter pledged collateral
4. Defaulter contribution to default fund
5. BCCC capital contribution or "skin in the game"
6. Mutualised default fund
7. Capped participant assessments
8. Recovery and resolution tools

The exact structure would depend on whether BCCC is legally treated as a payment system, clearing house or central counterparty in each jurisdiction. A sovereign or central-bank failure to perform creates different legal issues from the insolvency of a commercial bank and should be covered by separate contractual provisions.

## 23. Foreign-Exchange Risk Between Trade and Settlement

The earlier framework did not identify who carries the currency risk between transaction time and final settlement. That exposure must be allocated explicitly.

For spot transactions, the preferred initial design is same-day or next-business-day settlement with a published fixing. For longer settlement periods, the importer, exporter or its commercial bank must hedge the exposure.

BCCC should not silently become the system-wide warehousing entity for unpriced foreign-exchange risk. Where linked currencies settle simultaneously, payment-versus-payment architecture should be used to reduce principal risk.

## 24. Collateral Wrong-Way Risk

A system designed to avoid mandatory dollar collateral would naturally rely more heavily on participating-country sovereign securities and central-bank deposits. This creates potential wrong-way risk: if a participant experiences a sovereign fiscal shock, the value of its domestic sovereign collateral may fall at precisely the time that its settlement creditworthiness deteriorates.

The solution is not to exclude sovereign collateral entirely. Instead the system should impose:

- concentration limits on own-sovereign collateral;
- higher haircuts where collateral and participant credit risk are strongly correlated;
- minimum diversified collateral requirements;
- stress haircuts;
- limits on illiquid securities;
- independent collateral valuation.

## 25. Pro-Cyclicality

A formula such as:

```
CreditLimit_i = Collateral_i * DebtSustainability_i
```

would be dangerously procyclical if applied continuously. A deterioration in fiscal conditions would lower the debt score, reduce the value of sovereign collateral and reduce access to clearing liquidity simultaneously. Such a design could amplify rather than absorb stress.

Sovereign risk should therefore affect **supervisory credit bands** rather than mechanically determining daily credit. A possible framework is:

| Band | Treatment |
|---|---|
| A | normal limits |
| B | enhanced margin |
| C | restricted unsecured exposure |
| D | prefunded settlement only |

Movement between bands should use multi-period averages, warning thresholds and supervisory judgment rather than a single daily statistic. A minimum settlement floor may be retained for otherwise solvent trade transactions, supported by a conditional emergency facility subject to strong collateral and collective approval.

## 26. Creditor Balances and the Asset Problem

The most important economic weakness of many clearing systems is the treatment of persistent creditors. A country that repeatedly exports more into the system than it imports eventually accumulates claims. If those claims cannot be converted, invested or used to purchase desirable assets, exporters have little incentive to continue accepting them.

The BCC architecture therefore requires a creditor-asset layer. Positive settlement balances could be eligible for:

- conversion into participating central-bank money;
- purchase of qualifying NDB securities;
- purchase of eligible participating sovereign securities subject to limits;
- funding of approved cross-border infrastructure;
- future import settlement.

The New Development Bank is relevant because its 2022–2026 strategy explicitly targeted 30 per cent of financing in member-country local currencies, partly to reduce foreign-exchange mismatch for projects with local-currency revenues.

## 27. Symmetric Adjustment

A durable clearing architecture should not place the entire burden of adjustment on deficit participants. Persistent creditor accumulation can be destabilising as well.

The system should therefore investigate symmetric incentives inspired by earlier international clearing proposals: progressively higher costs for excessive persistent debtor positions and declining remuneration or reinvestment requirements for excessive persistent creditor balances.

The objective is not to penalise successful exporters. It is to prevent the clearing system from becoming a warehouse of permanently unusable claims. The appropriate parameters should be estimated from trade-flow simulations rather than determined politically in advance.

## 28. Adoption and Network Effects

The incumbent advantage of the dollar is partly a coordination equilibrium. A firm chooses an invoicing and settlement currency partly according to what its customers, suppliers, banks and hedging markets already use.

A simple representation is:

```
ExpectedCost_f(c) = HedgeCost_f(c) + SettlementCost_f(c) + LiquidityCost_f(c)
                  + OperationalCost_f(c) - lambda * NetworkUse_c
```

The firm chooses currency `c` that minimizes `ExpectedCost`. As `NetworkUse_c` increases, that currency becomes cheaper and easier to use.

This strategic complementarity can generate multiple equilibria. An alternative transaction unit may be economically feasible yet fail to obtain adoption because every private participant waits for everyone else to move first.

A credible coordination mechanism may therefore involve voluntary public-sector and NDB contracts initially publishing parallel BCC-T prices, together with market-making commitments from participating banks. The objective is to cross a liquidity threshold, not to mandate permanent use.

## 29. Political Economy

The architecture must also be incentive-compatible for its largest participants. A concentration cap potentially limits the numerical influence of the largest economy. That economy must therefore obtain other benefits from participation.

Potential benefits include deeper direct currency markets, lower reliance on third-currency hedging, increased demand for domestic-currency financial assets, reduced transaction friction with participating economies and greater influence over a multilateral rather than externally governed payment infrastructure.

Smaller members gain protection from single-currency dominance. Large members gain network expansion. The arrangement can survive only if both propositions remain credible.

## 30. Sanctions and Compliance Position

The BCC architecture proposed here should be **sanctions-neutral** rather than sanctions-resistant. Its purpose is not to provide an opaque mechanism for avoiding legal obligations.

Participating institutions remain subject to applicable domestic law, customer due diligence, anti-money-laundering requirements, counter-terrorist-financing controls, beneficial-ownership rules and legally applicable sanctions.

This positioning is important for adoption. A system marketed primarily as a sanctions-avoidance technology would substantially increase legal, correspondent-banking and de-risking concerns for internationally active financial institutions.

Dollar independence and regulatory evasion are analytically distinct objectives. This paper proposes the former, not the latter.

## 31. Relation to Current BRICS Policy

The proposal is more ambitious than the current BRICS position.

The September 12, 2026 New Delhi Declaration states that the BRICS Payment Task Force is studying efficient cross-border payment mechanisms, payment and messaging interoperability, and the promotion of trade settlements and investment using BRICS local currencies while respecting differing national priorities.

This does not constitute agreement on a BRICS common currency. It nevertheless establishes a relevant institutional direction. BCC-T can be viewed as a research proposal for a common transaction numeraire above those local-currency settlement channels rather than a replacement for them.

## 32. India's Existing Local-Currency Settlement Framework

India already permits international trade to be invoiced and settled in INR through Special Rupee Vostro Accounts.

RBI states that this arrangement complements settlement through freely convertible currencies and can reduce dependence on hard currencies. It also states that the exchange rate between INR and the partner currency is to be market determined.

This infrastructure provides a bilateral building block. The proposed architecture changes:

```
Currency_A  <->  INR
```

into a multilateral structure:

```
Currency_A  <->  BCC-T reference  <->  Currency_B
```

with BCC-C used only where temporary clearing liquidity is required.

## 33. Implementation Sequence

| Phase | Name | Content |
|---|---|---|
| I | Statistical Infrastructure | Publish BCC-T composition, direct FX matrix, own-currency-excluded strength indices and BCC-D diagnostics. No BCC-C clearing credit is created. |
| II | Parallel Quotation | Participating public institutions, NDB operations and willing firms may publish prices simultaneously in national currency and BCC-T. |
| III | Limited Clearing Pilot | Selected banks begin BCC-C clearing under full collateralisation, enforceable netting opinions and conservative limits. |
| IV | Multilateral Netting | The network expands only after empirical evidence demonstrates operational reliability and acceptable creditor-balance behavior. |
| V | Asset Layer | Qualifying BCC-C creditor balances gain access to a defined pool of liquid local-currency and NDB instruments. |
| VI | Broader Market Development | Private BCC-T bonds, deposits, forwards and hedging instruments may develop if there is genuine market demand. |

This sequence mirrors an important lesson from the ECU experience: a common unit becomes substantially more useful when replicable private financial instruments and hedging markets develop around it.

## 34. Empirical Research Programme

The framework requires substantial empirical validation before policy implementation.

1. Reconstruct current and historical bilateral trade matrices across participating economies and estimate gross-to-net settlement compression.
2. Measure the persistence of creditor and debtor positions.
3. Back-test BCC-T volatility relative to major currencies and alternative baskets.
4. Back-test Fiscal Sustainability and CHS scores across sovereign-debt crises, inflation episodes and currency dislocations.
5. Estimate the international-usage regression and test whether particular currencies exhibit statistically significant persistent usage premiums after controlling for fundamentals and market depth.
6. Estimate actual hedging-cost differences between USD-mediated and direct participating-currency transactions.
7. Model the minimum public and private adoption required for BCC-T market liquidity to become self-sustaining.

Until these exercises are completed, the architecture should be presented as a testable institutional design rather than as a demonstrated superior monetary system.

## 35. Principal Limitations

1. International currency use reflects institutional and political factors that cannot be compressed perfectly into a quantitative index.
2. Some CPS data are incomplete or proprietary.
3. Direct currency markets may remain substantially less liquid than USD-based markets even if the clearing infrastructure is technologically sound.
4. An economic weight cap creates political distributional consequences.
5. BCC-C introduces a new institutional counterparty and therefore new credit, operational and legal risks.
6. Sovereign debt is not necessarily harmful. The fiscal consequences of debt depend on maturity, interest cost, currency denomination, domestic savings, taxation capacity and the productive assets financed.
7. A monetary network can remain dominant even when certain fiscal fundamentals deteriorate because liquidity itself has economic value.

The proposed diagnostic framework is therefore designed to measure that distinction, not to assume it away.

## 36. Interpreting the "Dollar Premium"

The phrase "dollar premium" should be used carefully. There is no reason to assume *ex ante* that the difference between dollar usage and US fiscal fundamentals is unjustified.

Deep capital markets, reliable settlement infrastructure, legal predictability and high liquidity are real economic services. Those services legitimately contribute to international currency demand.

The analytical objective is therefore decomposition:

```
ObservedCurrencyPower_i = FundamentalComponent_i
                        + MarketInfrastructureComponent_i
                        + NetworkComponent_i
                        + Residual_i
```

A currency may continue to command a large premium because markets value its infrastructure. The research question is how much of the observed international usage remains after measurable fundamentals and financial-market structure are taken into account. That residual can then be compared across currencies and through time.

## 37. What "Death of the Dollar" Means in This Framework

The phrase should not be interpreted as a prediction that the dollar will cease to exist or lose all value. The relevant condition is **infrastructural independence**.

Define:

```
MandatoryDollarDependency =
      USD_MandatoryMeasurement
    * USD_MandatoryInvoice
    * USD_MandatoryBridgeFX
    * USD_MandatoryClearing
    * USD_MandatorySettlement
```

The design objective is:

```
MandatoryDollarDependency = 0
```

This means that the monetary network can operate without the dollar. It does not mean that market participants are prohibited from selecting it.

- A firm may continue to invoice in USD when USD is cheaper.
- A central bank may continue to hold US securities when they satisfy its portfolio objectives.
- A bank may continue to trade USD when liquidity is superior.

The difference is that those choices become **economic choices rather than technological requirements**.

## 38. Conclusion

The present international monetary architecture derives substantial efficiency from the concentration of liquidity around the US dollar. That concentration has also created a strong network equilibrium in which the dollar is simultaneously a national currency, international reserve asset, trade-invoicing currency, vehicle currency and financial benchmark.

A credible alternative cannot be built by simply declaring another currency superior. Nor can a new transaction unit be made credible by continuously changing its value according to fiscal or political judgments.

This paper therefore separates the problem into three institutions.

- **BCC-T** is a stable, fixed-composition and independently replicable transaction unit.
- **BCC-C** is a narrowly defined collateralised clearing claim with an explicit legal and risk-management structure.
- **BCC-D** is a separate diagnostic framework for evaluating price stability, fiscal sustainability, external resilience and international currency usage.

Sovereign debt belongs in BCC-D and in supervisory risk management. It does not belong inside the contractual ruler.

The framework also replaces bilateral or independently calculated cross-rates with a jointly estimated, triangularly consistent FX matrix. It treats netting as a legal and credit institution rather than an arithmetic identity. It requires settlement finality, a default waterfall, collateral controls and explicit management of wrong-way and procyclical risk.

Most importantly, it does not assume that high US debt logically requires weak dollar international usage. The coexistence of debt and dollar power is precisely the phenomenon to be explained.

Dollar internationalisation is supported by liquidity, financial-market depth, legal infrastructure, investment assets and network externalities. The appropriate academic question is whether international usage exceeds what those observable fundamentals would predict.

That proposition can be estimated. If a statistically significant residual premium exists, it can be measured. If it does not, the framework must report that result as well.

The policy proposition is consequently more modest, but also more defensible:

> No national currency should be technically indispensable merely because the international financial system was historically constructed around it.

A multipolar monetary system does not require the destruction of the dollar. It requires credible alternatives to mandatory dollar intermediation.

Under that definition, the "Death of the Dollar" is not an assertion about the price of USD. It is a statement about infrastructure.

The dollar ceases to rule when currencies can be independently measured, trade can be independently invoiced, cross-rates can be independently discovered, obligations can be independently cleared and payments can be independently settled without requiring it.

---

## References

- Bank for International Settlements. *Principles for Financial Market Infrastructures*, CPMI-IOSCO, 2012.
- Bank for International Settlements. Historical material on the European Payments Union and European monetary cooperation.
- Banco Central do Brasil. *Local Currency Payment System (SML)*.
- Chinn, M. D. and Frankel, J. A. "Will the Euro Eventually Surpass the Dollar as Leading International Reserve Currency?" NBER Working Paper 11510, 2005.
- Gopinath, G., Boz, E., Casas, C., Díez, F. J., Gourinchas, P.-O. and Plagborg-Møller, M. "Dominant Currency Paradigm." *American Economic Review*, 110(3), 2020, pp. 677–719.
- Gopinath, G. and Itskhoki, O. "Dominant Currency Paradigm: A Review." NBER Working Paper 29556, 2021.
- Gourinchas, P.-O. and Rey, H. "From World Banker to World Venture Capitalist: US External Adjustment and the Exorbitant Privilege." NBER Working Paper 11563, 2005; published 2007.
- International Monetary Fund. *Currency Composition of Official Foreign Exchange Reserves*, 2026 Q1.
- Maggiori, M., Neiman, B. and Schreger, J. "International Currencies and Capital Allocation." NBER Working Paper 24673, 2018, revised 2019.
- New Development Bank. *General Strategy 2022–2026*.
- Reserve Bank of India. *International Trade Settlement in Indian Rupees*.
- BRICS. *New Delhi Declaration*, September 12, 2026.
- CEPAL. *Sistema de pagos transnacionales vigentes en América Latina: ALADI, SML y SUCRE*, 2013.

---

## Appendix A — Implementation Note

This document is the normative specification for the **MPCPI** Chrome extension
(*Multipolar Currency Pricing & Invoicing Instrument*) that ships alongside it in
`../extension/`. The mapping from paper section to code module is:

| Paper section | Module |
|---|---|
| §5–§7 Basket, self-reference | `core/basket.js` |
| §8–§9 Multilateral FX fixing | `core/fx-fixing.js` |
| §37 BCC-T pivot quotation | `core/basket.js` → `bcctQuotes()` |
| §10–§17 Diagnostics, normalisation, excess usage | `core/diagnostics.js` |
| §19–§20 Netting | `core/netting.js` |
| §22–§25 Waterfall, wrong-way risk, credit bands | `core/risk.js` |
| §23, §28, §37 Invoice pricing, adoption cost, dependency | `core/invoice.js` |
| §15 Leading vs lagging separation | `core/metrics.js` |

Two clarifying notes, because the paper does not specify them and the tool must:

1. **Leading vs lagging metrics.** The paper distinguishes high-frequency market
   indicators (§15) from slow structural diagnostics but does not formalise the
   combination. The implementation defines a horizon-weighted composite
   `w_L(T) = exp(-T/tau)` so that short settlement horizons are dominated by
   leading (market) signals and long horizons by lagging (structural) signals,
   plus a divergence early-warning statistic `LeadingIndex - LaggingIndex`.
   This is an implementation convention, not a claim of the paper.

2. **Vehicle exclusion.** §8 specifies a joint fit over observed quotes but does not say which
   quotes are admissible. Admitting the vehicle currency's quotes defeats §37's measurement
   condition, because those legs dominate the weighting and the outlier rule then discards
   participating crosses for disagreeing with them. The implementation therefore fits the
   participating network alone and attaches external currencies as satellites afterwards, and
   publishes every rate against BCC-T so that no bilateral requires a third currency to discover.
   This is an implementation decision the paper implies but does not state.

3. **Invoice price.** The paper prices no invoice. The implementation builds the
   invoice as a transparent additive decomposition over the BCC-T numeraire —
   commercial base, forward/CIP adjustment, unhedged volatility premium, credit
   charge from the §25 supervisory band, margin funding, clearing fee, netting
   rebate from §19, wrong-way surcharge from §24 and a composite-risk term —
   and reports the USD-intermediated route alongside it as the §37 dependency
   baseline. Every term is individually disclosed so that no component is
   asserted rather than derived.
