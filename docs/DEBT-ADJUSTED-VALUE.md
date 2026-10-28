---
title: "Debt-Adjusted Currency Value"
type: methodology-note
extends: BCC-FRAMEWORK.md §12, §16, §36
date: 2026-10-28
implements: extension/core/fiscal-backing.js
---

# Debt-Adjusted Currency Value

## 1. Question

How much purchasing power would a currency lose if its government closed its fiscal gap by
inflation instead of by taxing more or spending less? The same rule is applied to every currency,
the dollar included. A rule applied only to the dollar is an opinion, not a measurement.

## 2. Premise, corrected

Two common statements about the dollar need correcting before anything is built on them.

**"Countries deposited gold with the US and the US printed equal dollars."** Under Bretton Woods
(1944–1971) the US fixed the dollar at $35 per troy ounce. Other currencies were pegged to the
dollar, and foreign central banks could convert their official dollar holdings into US gold. They
did not deposit gold in exchange for newly printed dollars. Dollar claims held abroad were never
fully covered: by the 1960s official foreign dollar liabilities exceeded the US gold stock (the
Triffin dilemma). Convertibility was suspended on 15 August 1971.

**"The dollar is paper; gold is real."** Gold also yields no cash flow, and its price is set by
what people will pay for it. A fiat currency is a claim on the issuing state, which accepts it for
taxes. Its value is therefore tied to that state's fiscal position. That tie is the basis for a
debt adjustment, and it applies to the rupee, the yuan and the real exactly as it applies to the
dollar.

## 3. Method

Ratios to GDP throughout. *d* is government debt, *pb* the primary balance (balance before
interest), *r* the effective interest rate on the debt, *g* nominal GDP growth, *s* the share of
debt in foreign currency.

```
debt dynamics           d' = d·(1 + r)/(1 + g) − pb
stabilising balance     pb* = d·(r − g)/(1 + g)
fiscal gap              gap = pb* − pb
inflatable debt         d_L = d·(1 − s)
debasement pressure     π_x = gap / (d_L − gap)          when gap > 0
value after H years     V_H = (1 + π_x)^(−H)
pair adjustment         FX*_ij = FX_ij · ((1 + π_x,j)/(1 + π_x,i))^H
```

π_x solves d_L·π/(1 + π) = gap: one year of unanticipated inflation erodes the real value of the
own-currency debt by exactly the shortfall. If gap ≤ 0 the debt ratio is stable or falling and
π_x = 0. If d_L ≤ gap, inflation cannot close the gap, because foreign-currency debt cannot be
inflated away, and the risk becomes default or restructuring. The tool reports that case as such
rather than as a number.

## 4. The dollar, with published figures

US federal government, fiscal year 2026 (retrieved 2026-10-28):

| input | value | source |
|---|---|---|
| debt held by the public / GDP | 1.00 | CRFB end-FY2026 estimate |
| overall deficit / GDP | 6.2% | CBO Monthly Budget Review, Sept 2026 |
| net interest / GDP | 3.4% | CRFB |
| primary balance / GDP | −2.8% | 6.2% − 3.4% |
| effective rate | ≈ 3.5% | ≈ $1.1tn interest / ≈ $31tn average debt |
| nominal growth | 4.5% | **assumption** |

```
pb*  = 1.00 × (0.035 − 0.045) / 1.045 = −0.96%
gap  = −0.96% − (−2.80%)              = 1.84% of GDP per year
π_x  = 0.0184 / (1.00 − 0.0184)       = 1.88% per year
V_10 = 1.0188^−10                     = 0.830   (17.0% lost over ten years)
```

Sensitivity to the one assumed input: with *g* = *r* (no growth advantage) the gap is the full
2.8% primary deficit and π_x ≈ 2.9% per year, or about 25% over ten years.

Federal debt held by the public is narrower than the general-government gross debt used for most
countries. The IMF put US general-government gross debt at 124.4% of GDP in 2025. A comparison
across countries should use one basis for all of them.

## 5. The same rule applied to every currency

On the built-in sample data (member inputs are **illustrative, not official**):

| economy | debt/GDP | r − g | gap | π_x / yr | lost over 10 y |
|---|---|---|---|---|---|
| RU | 21% | +1.0% | 2.0% | 13.3% | 71% |
| BR | 87% | +4.0% | 3.8% | 4.9% | 38% |
| CN | 88% | −1.6% | 2.9% | 3.5% | 29% |
| ZA | 75% | +3.5% | 1.7% | 2.6% | 22% |
| US | 100% | −1.0% | 1.8% | 1.9% | 17% |
| IN | 82% | −2.8% | −1.1% | 0 | 0 |

The measure does not single out the dollar. A low debt ratio does not protect a currency either:
Russia's small inflatable base means a modest gap requires heavy inflation. What drives the result
is r − g together with the primary balance. A high interest rate relative to growth (Brazil, South
Africa) does more damage than a high debt stock with cheap financing (the US, India).

## 6. What this measure is and is not

**Fact.** The arithmetic in §3 is the standard debt-dynamics identity used in IMF debt
sustainability analysis.

**Inference.** π_x is an upper bound on the monetary channel. It assumes the whole gap is
monetised, the inflation is unanticipated, and the debt does not reprice within the year. None of
those holds exactly. Short average maturity makes the bound an understatement, because new debt is
issued at rates that already include the inflation.

**Not a market price.** Exchange rates already reflect what markets believe about fiscal paths.
Jiang, Lustig, Van Nieuwerburgh and Xiaolan (*Econometrica* 92(4), 2024, "The U.S. Public Debt
Valuation Puzzle") find that the market value of US debt exceeds the present value of projected US
surpluses. That is the formal version of the claim that the dollar is valued above its fiscal
backing. The gap they measure is a convenience yield: what holders pay for the liquidity and safety
of Treasuries. It is real demand, not an accounting error. Whether it persists is an empirical
question.

## 7. Where debt enters the system, and where it must not

| layer | does debt enter? | why |
|---|---|---|
| BCC-D health score (§10, §12) | yes, already | fiscal block, 30% of CHS |
| debt-adjusted value (this note) | yes | diagnostic, every currency on one rule |
| collateral haircuts, credit bands (§24, §25) | yes, smoothed | risk management |
| BCC-T contractual weights (§6) | **no** | see below |
| settlement rates | **no** | see below |

**Why not settle at debt-adjusted rates.** If a contract settles at a rate other than the market
rate, one side receives less than it could get in the market, and someone has to pay the
difference. Either capital controls force the trade through the official rate, or a sponsor
subsidises it. That is how the transferable rouble failed (§3 of the framework). A unit that only
works under compulsion will not replace a currency that people choose to use.

**Why not put debt into the basket weights.** A five-year contract cannot be priced in a unit whose
composition changes when a committee revises a fiscal score (§4). Debt scores also fall in a crisis,
which would cut weights exactly when stability is most needed (§25).

**The defensible version.** At a *scheduled* reconstitution, applied only to new contracts, a
currency whose debasement pressure exceeds a published threshold for several consecutive periods
can have its weight capped. This puts debt into the unit going forward without changing outstanding
contracts. It is a governance choice, not something the arithmetic decides, and it is **not
implemented** in this repository.

## 8. A defect this work found

The §16 excess-usage regression, which is meant to measure whether the dollar is used more than its
fundamentals justify, silently dropped the dollar. USD, EUR, JPY and GBP had usage data but no
fundamentals row, so they had no health score and were filtered out without a warning. The "dollar
premium" was estimated on five BRICS currencies only.

The fix: fundamentals rows may now name their currency, which makes an economy outside the basket a
*reference economy*. It is measured by the same rules as the members, but takes no part in the
basket or in clearing. The US is included in the sample, and any currency that is still dropped is
named in a warning.

With the dollar included, the sample regression gives USD a residual of −0.28 CPS points
(t ≈ −2.1). That figure says nothing about the real world, for two reasons:

1. **Leverage.** The USD is the only reserve-scale currency in the panel, so least squares fits
   close to it whatever its true premium. Estimating a dollar premium requires comparators of
   similar scale: EUR, JPY, GBP and CHF, each with a fundamentals row.
2. **Depth is not a neutral control.** Market depth is partly *caused by* dollar dominance.
   Controlling for it defines part of the premium away. The premium should be reported both with
   and without the depth control.

## 9. Failure modes

| failure | consequence | guard |
|---|---|---|
| mixing federal and general-government debt | inconsistent ranking | one basis per comparison; source per row |
| g assumed rather than measured | gap sensitive to ±1pp | report g = r case beside the base case |
| short maturity | π_x understated | flag maturity < 4 years (not yet implemented) |
| treating π_x as a forecast | false precision | label it as an upper bound everywhere it is shown |
| applying the rule to the dollar only | advocacy rather than measurement | one function, every row; tested |
| debt feeding the basket | ruler moves under contracts | tested: tripling every debt ratio leaves every basket quantity unchanged |

## References

- Congressional Budget Office, *Monthly Budget Review: September 2026*.
- Committee for a Responsible Federal Budget, FY2026 end-of-year deficit estimate (2026).
- IMF, *Fiscal Monitor* and DataMapper, general-government gross debt, United States (2026).
- Jiang, Z., Lustig, H., Van Nieuwerburgh, S. and Xiaolan, M. Z. (2024). "The U.S. Public Debt
  Valuation Puzzle." *Econometrica* 92(4): 1309–1347. doi:10.3982/ECTA20497.
- Triffin, R. (1960). *Gold and the Dollar Crisis*. Yale University Press.
