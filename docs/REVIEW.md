---
title: "Review — A BRICS Transaction Unit and Diagnostic Framework for Multipolar Currency Settlement"
type: referee-report
date: 2026-09-18
basis: "Written after implementing the framework in full (see ../README.md). Claims marked MEASURED were tested against a working implementation rather than argued."
---

# Review

## Summary judgement

This is a careful paper with an unusually honest relationship to its own limits. The central
architectural move — separating the **unit of account** (BCC-T) from the **settlement claim** (BCC-C)
from the **statistical assessment** (BCC-D), so that a revised opinion about a country's fiscal
position cannot retroactively alter what a five-year contract is worth (§4) — is correct, important,
and not obvious. Most proposals in this space collapse these three and are unusable as a result.

Three further decisions are better than the literature usually manages:

- Replacing a hand-constructed "Privilege Gap" with an estimable residual (§16), which converts an
  assertion into a falsifiable statement.
- Rejecting cross-sectional min-max normalisation for fixed reference distributions (§11). This is a
  common and serious error in index construction and the paper is right to refuse it.
- Rejecting `CreditLimit = Collateral × DebtSustainability` as procyclical (§25). The reasoning is
  exactly right and the supervisory-band alternative is the standard supervisory answer.

The paper is also unusually willing to say what it has not shown (§20, §34, §35) and to refuse the
easy anti-dollar conclusion (§17, §36). That restraint is the paper's main credibility asset and
should be protected in revision.

What follows is where I think it is wrong, underspecified, or missing something material. I
implemented the framework end to end, so several of these are measurements rather than opinions.

---

## A. Errors

### A1. The §37 objective is satisfied by doing almost nothing — MEASURED

§37 defines

```
MandatoryDollarDependency = USD_MandatoryMeasurement × USD_MandatoryInvoice
                          × USD_MandatoryBridgeFX × USD_MandatoryClearing
                          × USD_MandatorySettlement
```

and sets the design objective at `= 0`.

A product is zero as soon as **any single factor** is zero. So:

| state of the world | product | meets the stated objective? |
|---|---|---|
| all five functions still require the dollar | 1 | no |
| **one** function freed, four still dollar-dependent | **0** | **yes** |
| four freed, one still dollar-dependent | 0 | yes |
| all five freed | 0 | yes |

The paper's own objective is therefore met by freeing one dimension and leaving the other four
untouched — the opposite of what §37 argues for throughout. This is the paper's headline formalism
and as written it is trivially satisfiable.

**Fix.** Either state the condition as a conjunction —

```
MandatoryDollarDependency = 0  ⟺  USD_Mandatory_d = 0 for every d ∈ {measurement, invoicing,
                                  bridgeFX, clearing, settlement}
```

— or make it a count, `Σ_d USD_Mandatory_d = 0`, which additionally gives you a usable progress
metric ("3 of 5 dimensions independent") rather than a binary that flips on the first success. The
count is what a reader actually wants.

### A2. §8 as specified defeats §37 — MEASURED, and this is the serious one

§8 says the fixing estimates shadow prices from "observed quotes" and weights them by executable
volume, spread, depth, age and venue quality. It never says **which quotes are admissible**.

If dollar quotes are admitted to that estimation — and nothing in §8 excludes them — they dominate
it, because they are the deepest and tightest quotes in any real dataset. In a representative quote
set, dollar-legged quotes carried **68.8% of the total fitting weight**. The consequence is worse
than mere influence: because §9's outlier rule measures deviation from the fitted matrix, a direct
participating cross that disagrees with the dollar-implied value is first outvoted and then
**discarded for disagreeing**.

Moving a direct CNY/INR quote away from its dollar-implied value, and asking where the published
fixing lands:

| direct quote moved by | published fixing moved toward it by |
|---|---|
| 25 bps | 0% |
| 50 bps | 0% |
| 100 bps | 0% |
| 200 bps | 0% |

The fixing sat on the dollar-implied value in every case. The "triangularly consistent BRICS matrix"
is then the dollar's rate structure relabelled, and §37's measurement independence is violated by
the very method §8 prescribes.

**Fix.** §8 must be explicit that the fixing is estimated over **participating currencies only**,
from quotes whose *both* legs are participating. External currencies are attached afterwards as
satellites: their shadow prices are solved against the already-fixed participant block, with
participant prices held constant. The dollar stays quotable and payable and gains no vote.

This also forces an honest failure mode the paper should embrace: if the participating quote graph
is disconnected — which is what most real BRICS market data looks like today, being almost entirely
dollar legs — the fixing should **refuse to produce a matrix** and report that the network cannot yet
measure itself. That is a finding about Phase I readiness, not a data error.

### A3. §16's fixed-effects specification is not estimable, and conflicts with §36 — MEASURED

Two problems.

**It fails numerically.** CHS moves slowly and the panel is short. In a 9-currency × 4-year panel the
currency dummies absorb CHS almost entirely; with CHS constant within currency the design matrix is
singular outright. Even where it is not exactly singular, β is being estimated from negligible
within-currency variation. The regressors are also badly collinear to begin with:
corr(CHS, MarketDepth) = **0.92**, corr(CHS, TradeScale) = 0.79 — healthy currencies and deep markets
are close to the same variable.

**It contradicts §36.** §36 proposes the decomposition

```
ObservedCurrencyPower = Fundamental + MarketInfrastructure + Network + Residual
```

But `μ_i` in §16's fixed-effects specification *is* the persistent network component. With fixed
effects, Network sits inside μ_i and cannot also be a separate term. Without fixed effects, Network
sits inside the residual, and the §16 headline measure ExcessUsage = ε then conflates network effect
with transitory deviation. §36's four-way split is not separately identified under either
specification the paper offers.

**Fix.** Pick one. Either (a) drop the fixed-effects variant, define ExcessUsage as the pooled
residual, and state plainly that it bundles persistent network advantage with transitory deviation;
or (b) keep fixed effects, report μ_i explicitly *as* the network component, and define ExcessUsage
as the within-residual only. Option (b) is the more informative and matches §36, but needs a longer
panel and an instrument or a structural assumption for CHS. Either way, report the VIFs.

---

## B. A material omission

### B1. BCC-T is not risk-free for anyone, and it redistributes risk against the largest members — MEASURED

The paper treats BCC-T as a neutral ruler. For measurement purposes it is. For **invoicing** it is
not: a firm's costs are in its home currency, and an invoice denominated in a basket exposes it to
the basket. §7 discusses self-reference for measurement, but the paper never states what invoicing in
BCC-T does to a single-currency firm's risk.

Simulating correlated currency moves and measuring the volatility of what an exporter actually
receives:

| exporter's home currency | invoice in own currency | invoice in BCC-T | invoice in USD |
|---|---|---|---|
| CNY | 0.00% | **6.20%** | 4.80% |
| INR | 0.00% | **6.01%** | 5.39% |
| BRL | 0.00% | 8.71% | 13.23% |
| RUB | 0.00% | 18.87% | 23.76% |
| ZAR | 0.00% | 10.65% | 15.18% |

Two things follow, and neither appears in the paper.

**First, BCC-T only ever helps relative to a third currency.** Against home-currency invoicing it
strictly adds risk, for every member. The real-world alternative for a Brazilian exporter to an
Indian importer is not only "BRL→USD→INR"; it is also "invoice in BRL and let the importer carry the
exposure", which §32's rupee-vostro arrangements already permit bilaterally. The paper's comparison
set should include that option, because it is the one a treasurer will actually raise.

**Second, and more seriously for §29: BCC-T transfers exchange-rate risk from the volatile members to
the stable ones.** For China and India — the two largest participants, whose participation the scheme
most needs — invoicing in BCC-T is *riskier than invoicing in dollars*, because the basket is dragged
about by the rouble, the rand and the real. This holds across the entire plausible correlation range:

| assumed correlation among members | CNY: BCC-T vs USD | INR: BCC-T vs USD |
|---|---|---|
| 0.1 | 6.1% vs 5.2% ✗ | 6.3% vs 5.7% ✗ |
| 0.3 | 6.1% vs 4.9% ✗ | 6.1% vs 5.5% ✗ |
| 0.45 | 6.1% vs 4.8% ✗ | 6.0% vs 5.3% ✗ |
| 0.6 | 6.2% vs 4.6% ✗ | 5.9% vs 5.2% ✗ |
| 0.8 | 6.2% vs 4.5% ✗ | 5.7% vs 5.1% ✗ |

(✗ = the dollar is the lower-risk invoicing choice for that member.)

§29 argues the political economy works because large members gain "deeper direct currency markets"
and "network expansion" in exchange for accepting a concentration cap. The risk transfer above is a
second, unacknowledged cost falling on the same members, and it is not small. A paper arguing for
incentive compatibility has to price it.

**Fix.** Add a section on the risk properties of the unit. State that BCC-T dominates the dollar for
high-volatility members and is dominated by it for low-volatility members. Then address the
implication: either the stable members need compensation elsewhere in the design, or BCC-T's natural
initial use is as a *reference and clearing* unit (where the basket property is a virtue) rather than
an *invoicing* unit (where it is a cost to precisely the members you need most). The Phase I/II
sequence in §33 could be reframed around that distinction, and would be stronger for it.

---

## C. Underspecifications

### C1. §23 prices only one side of the comparison

§23 allocates FX risk between trade and settlement and requires PvP for linked currencies. But the
paper never prices the **incumbent** route, which makes any claim of advantage unfalsifiable as
written. A fair comparison must charge correspondent banking for what it actually costs: two
conversions, two intermediary bank exposures, nostro funding over the longer settlement, and — the
one §18 implies but never books — **principal risk from the absence of PvP**. §18 cites PvP as a
design virtue of BCC-C; its absence on the incumbent route is therefore a cost of that route and
should appear as one.

When both routes are priced honestly, the gap is small. On plausible parameters the two settlement
infrastructures came out within a few basis points of each other, inside a common block of 300–1500
bps of carry and unhedged FX risk that is identical either way. And the direct route loses once
participating crosses are roughly 3× wider than the dollar legs, which is not far from today.

This supports §28's own argument — the obstacle is liquidity and coordination, not cost — but it
means the paper should stop implying a cost dividend and lead with option value and resilience.

### C2. §26's creditor-asset layer is partly circular

§26 correctly identifies the persistent-creditor problem as the binding constraint, and §3 correctly
diagnoses it as what killed the transferable rouble. But three of the five proposed outlets —
participating sovereign securities, participating central-bank money, future import settlement — give
the creditor **more claims on the same members it is already over-exposed to**. That relabels the
problem rather than solving it. Only NDB securities and approved infrastructure are genuinely
external to the bilateral relationship, and the NDB balance sheet is small relative to plausible
BRICS trade flows.

**Fix.** Quantify it. If structural creditor accumulation runs at *X* per year, the asset layer must
absorb *X*, and the paper should state what *X* implies for NDB issuance. If the number is
implausible, that is the most important empirical finding in the paper and belongs in §34's
programme, near the top.

### C3. Netting efficiency and creditor concentration are not independent

§19 and §20 treat compression and persistence as separate diagnostics. They are correlated by
construction: a hub-and-spoke trade structure produces **both** high compression and high
concentration. A headline compression figure can therefore be a *symptom* of the concentration
problem rather than reassurance against it. In stress testing, scenarios that cut flows reduced net
settlement — which looks like an improvement — while concentration worsened.

§20 should say that compression must never be reported without concentration beside it, and that a
falling settlement figure under stress is not good news if less is being settled because less is
being traded.

### C4. Accession and exit are undefined

§6 schedules reconstitution but the paper never says what happens when a member joins or leaves.
For a unit intended to anchor five-year contracts this is a material governance hole: a member
leaving mid-contract changes the quantity vector, which §4 and §5 promise will not happen. A
published accession/exit protocol — and the treatment of contracts outstanding across it — is
needed.

### C5. §33's Phase I has a bootstrapping problem it does not acknowledge

Phase I requires publishing a credible BRICS cross-rate matrix. Under the corrected §8 (see A2) that
requires liquid participating crosses, which largely do not exist — that is the problem the
architecture is meant to solve. The sequence has a chicken-and-egg step at position one. §28's
market-making commitments are the right instrument, but they belong *in* Phase I rather than being
discussed separately.

---

## D. Smaller points

- **§10 double-counts reserves within a block.** External Resilience contains both reserve coverage
  and short-term external debt **/ reserves**. Reserves appear twice inside the same sub-index. The
  paper's own standard (§10: variables should not appear elsewhere in the same composite) is
  violated. Use short-term external debt / GDP, or state the overlap.
- **§6 mixes shares and levels.** Trade share and GDP share are shares across members; FX liquidity
  and convertibility are levels. The subsequent normalisation rescues the arithmetic, but the stated
  weights (0.40 / 0.30 / 0.15 / 0.15) then do not mean the influence each factor has. Either
  normalise all four inputs to shares first, or state that the weights apply to [0,1] scores and are
  not shares of influence.
- **§11's `10 × z` scaling is unjustified.** Ten points per reference standard deviation means the
  score saturates at ±5σ and a 2σ difference is 20 points. That may be right, but the constant needs
  a sentence of justification, since it determines how much of the distribution is compressed against
  the bounds.
- **§22's waterfall omits a second BCCC capital tranche.** PFMI practice usually places CCP capital
  both before and after the mutualised fund. Worth stating whether the omission is deliberate.
- **§24's remedies interact badly.** Concentration limits on own-sovereign collateral push members
  toward *peer*-sovereign collateral, which creates cross-exposure among members — systemic wrong-way
  risk that the per-member rules do not detect. Worth a sentence.
- **Formula corruption in the received text.** §7 (`100  EXP(...)`, `w_ij  LN(...)`) and §11
  (`Direction_x  10z_x`) have lost their multiplication operators; §19 contains a URL-encoding
  artefact (`ABS%28NetPosition_i%29`). Cosmetic, but they should be fixed before circulation.
- **Empirical anchors need dating.** The COFER 2026 Q1 figure (57.13%) and the New Delhi Declaration
  of 12 September 2026 are load-bearing for §1 and §31. Give retrieval dates and a stable citation
  for each; a reader checking a recent statistic against a revised series will otherwise find a
  mismatch and distrust the rest.

---

## E. What I would do in revision

In rough order of value:

1. **Fix §37** (A1). It is one sentence and it is the paper's headline claim.
2. **Make §8 exclude external currencies from the estimation** (A2). Without this, §37 is not
   satisfied by the paper's own method, and a careful referee will find it.
3. **Add the risk section** (B1). This is the most interesting unaddressed question in the paper and
   it materially changes §29's political-economy argument. It is also a point in the paper's favour
   for three of five members, so it is not merely a concession.
4. **Resolve §16 vs §36** (A3). Choose one identification and say what it can and cannot separate.
5. **Price the incumbent route** (C1), so the comparison is falsifiable. Expect the honest answer to
   be "about the same", and lead with §28 rather than with cost.
6. **Quantify the creditor-asset requirement** (C2) and move it up §34's list.

None of these is fatal. A2, A3 and B1 are substantial and would each take a section. The
architecture survives all of them — in the case of B1 it is arguably strengthened, because a design
that knows which members it disadvantages is more credible than one that assumes everyone gains.

## F. On the standard of proof the paper sets itself

The paper says repeatedly that it is a design rather than a demonstration, and that §34's programme
must run first. It should hold that line under pressure. The implementation exercise behind this
review produced results that cut both ways — the netting compression was large, the cost advantage
was negligible, the measurement independence was violated by the paper's own fixing method until it
was corrected, and the unit turned out to disadvantage the two members it most needs. A framework
that reports all four is worth more than one that reports only the first.
