# MPCPI — Multipolar Currency Pricing & Invoicing

A floating Chrome extension that implements the BRICS **BCC-T / BCC-C / BCC-D** framework in
[`docs/BCC-FRAMEWORK.md`](docs/BCC-FRAMEWORK.md). It takes a Google Sheet or an Excel workbook,
fits a triangularly consistent cross-rate matrix, constitutes the BCC-T basket, scores leading and
lagging diagnostics, nets the obligation matrix, and **prices each invoice as a transparent sum of
named components — with the dollar-intermediated route priced beside it.**

```
Google Sheet / .xlsx / .csv
        │
        ▼
   ingest ──► fuzzy column mapping + a validation report you can act on
        │
        ▼
   fixing  §8   TWO STAGES, and the separation is the point
        │       1. participating network fitted ALONE — no external quote enters
        │       2. USD attached as a satellite: quotable, payable, no influence
        │       FX_ij · FX_jk = FX_ik holds by construction, not by luck
        ▼
   pivot   §37  every currency quoted against BCC-T; FX_ij = V_j / V_i
        │       no third currency is consulted to discover any pair
        ▼
   basket  §6   fixed quantity vector, capped and redistributed
        │       ── diagnostics never feed back into this. §4 ──
        ▼
 diagnostics §10–§16   leading | lagging, fixed reference distributions, excess-usage regression
        │
        ▼
   netting §19  multilateral compression + creditor persistence + stress
        │
        ▼
   invoice      base + carry + FX premium + credit + margin + fee − netting rebate
                + wrong-way + leading/lagging  ⇄  USD route, priced in parallel
```

## Install

```bash
npm install && npm run build:css
```

Then run `./run.sh`, which opens a separate Chrome profile on `chrome://extensions` with
Developer mode already enabled and reveals the folder in Finder. Drag the highlighted
`extension` folder onto the extensions page, or use **Load unpacked**.

> Select `mpcpi/extension` — the folder containing `manifest.json` — **not** the repository
> root `mpcpi`. Picking the root gives you `Manifest file is missing or unreadable`.

Chrome 137 removed `--load-extension` and the override flag, so an unpacked extension can no
longer be side-loaded from the command line; that drop is the one manual step.

Press **Alt+Shift+M** on any page, or click the toolbar icon, to open the floating panel.
On a Google Sheets tab, right-click → *Load this Google Sheet into MPCPI*.

No API key is needed for any of the arithmetic. A model provider is required only for the Agent tab.

## What it computes

| Tab | Implements | The thing worth looking at |
|---|---|---|
| **Data** | ingestion | Every uncertain column match and coerced cell is reported, not applied silently |
| **Fixing** | §8, §9, §37 | Rates quoted in BCC-T as the primary table, the vehicle marked as a satellite; input quotes violating triangular consistency by hundreds of bps against a published matrix consistent to ~1e-12 |
| **Basket** | §5–§7 | The cap binding on the largest currency, and the self-reference attenuation that makes a common basket unable to measure its own members |
| **Diagnostics** | §10–§16 | Leading against lagging, with a horizon slider; the excess-usage regression with standard errors |
| **Netting** | §19, §20, §27 | Compression *and* the creditor persistence that actually decides whether the design works |
| **Invoice** | §23–§25, §37 | The line-by-line price, and the honest comparison against the dollar route |
| **Agent** | — | Provider-agnostic analyst that reads results through tools rather than computing them |

## The invoice price

The build-up is split into costs that depend on the route and costs that do not, because
conflating them makes the route comparison meaningless.

```
COMMON — identical on both routes, and they very nearly cancel
    forwardAdj        covered-interest carry to the settlement date    §23
  + volPremium        z · σ_cross · √(T/252) · (1 − hedgeRatio)        §23
  + compositeAdj      horizon-weighted leading/lagging deviation       §15

DIRECT — clearing inside the participating network
    fxConversion      cheapest path that does NOT transit the vehicle  §8, §28
  + creditCharge      importer PD × LGD, mitigated by the CCP          §25
  + marginFunding     IM × band multiplier × funding rate × T/360      §18, §25
  + clearingFee       BCCC fee on cleared notional                     §18
  − nettingRebate     compression × liquidity rate × settlement cycle  §19
  + wrongWay          correlation loading, as an increment to PD       §24

INCUMBENT — correspondent banking via the vehicle currency
    fxConversion      two legs through the vehicle
  + settlementFees    two legs
  + correspondentFees two flat charges
  + counterpartyCredit importer PD × LGD, unmargined, no CCP
  + correspondentCredit in-flight exposure to two intermediary banks
  + principalRisk     no payment-versus-payment                        §18, §23
  + nostroFloat       funding the extra settlement day
  + nettingRebate     none: correspondent banking settles gross        §19
```

Every term is signed, labelled, individually recoverable and restated in any participating currency.
Nothing is folded into an opaque risk margin.

### Reading the route comparison

On the sample data the common block is **440 bps** and the two infrastructures differ by **0.05 bps**
(9.73 direct against 9.78 via the vehicle). Charting the all-in totals would compare two nearly
identical numbers and hide the mechanism entirely, so the panel compares the route-specific costs and
states the common block once beneath them.

Two verdicts are reported, and flagged when they disagree:

| Verdict | Decided by |
|---|---|
| `cheaperInfrastructure` | the clearing designs — what the framework is about |
| `cheaperRoute` (all-in) | the above, plus one extra day of unhedged FX risk on the incumbent's longer settlement |

On a volatile pair that extra day can be worth more than the whole infrastructure difference. It is a
real cost, but it comes from the settlement calendar rather than the clearing design, so the tool says
which is which instead of letting one silently decide the other.

The result is **not baked in**. What decides it is the liquidity of the participating crosses, which
is exactly the obstacle §28 identifies — and the conversion cost comes from the user's own quotes, via
a cheapest-path search that is forbidden to transit the vehicle currency:

| Participating crosses | direct infra | via vehicle | direct wins |
|---|---|---|---|
| as quoted | 14.30 bps | 16.65 bps | 6 / 6 |
| 3× wider | 24.05 bps | 18.13 bps | 1 / 6 |
| 10× wider | 58.16 bps | 18.13 bps | 0 / 6 |

### Leading and lagging

The framework separates fast market indicators from slow structural ones (§15) but does not say how
to combine them. This implementation makes the convention explicit:

```
w_L(T) = exp(−T / τ)            τ = 90 days by default
Composite = w_L · Leading + (1 − w_L) · Lagging
Divergence = Leading − Lagging  ← early warning, reported separately
```

A one-day settlement is dominated by market signal; a one-year exposure by structural fundamentals.
On the sample data, RU shows a leading index of 22.2 against a lagging index of 51.6 — a divergence
of −29.4, flagged as *deteriorating ahead of fundamentals*. That is the separation earning its keep.

## What it will tell you that you may not want to hear

On the built-in sample the two settlement infrastructures cost **almost exactly the same** — a few
basis points apart on a 440 bps common block. The framework's advantage is real but small, it comes
from CCP credit mitigation and multilateral netting, and it is offset by a genuine liquidity penalty:
the participating crosses are wider than the vehicle legs, so converting inside the network costs
more. Thin enough crosses flip the answer entirely.

That is the honest shape of the result, and it matches what §28 predicts: the obstacle is liquidity
and coordination, not technology.

The netting panel likewise reports that CN accumulates persistently across all twelve sample periods,
which makes the §26 creditor-asset layer the binding constraint rather than a footnote.

### The vehicle currency does not set the internal matrix

A single pooled fit over every quote does not work, and the failure is not subtle. The vehicle's legs
are the deepest and tightest quotes in any real set — in the sample they carry **68.8% of the total
fitting weight** — so a direct participating cross that disagrees with the vehicle-implied value is
first outvoted and then **discarded by the outlier rule for disagreeing**. Moving the direct CNY/INR
quote 25, 50, 100 or 200 bps away moved the published fixing **0% of the way** toward it. The
published "BRICS cross rates" were the dollar's rates under another name, while the §37 panel
reported measurement independence.

The fixing therefore runs in two stages. Participating currencies are fitted from quotes whose *both*
legs are participating; external currencies are then attached as satellites against the fixed block.
A participating cross now follows its own market, and moving the vehicle legs alone cannot shift any
participating rate at all — both are asserted by tests, and both fail if the stages are merged.

If the participating quote graph is disconnected, the tool **refuses** and says the network cannot yet
measure itself, rather than quietly repairing it by readmitting the vehicle. On a quote set containing
only dollar legs — which is what most real BRICS market data looks like — that is exactly what happens.

### Errors this tool has already made

The first working version reported the dollar route cheaper on 4 of 6 invoices. That was wrong, and
the reasons are worth stating because they are the failure modes this kind of model invites:

- The direct route paid **nothing** to cross the spread while the incumbent paid for two legs.
- The wrong-way surcharge multiplied the collateral pool's *entire* effective haircut, including a
  36-point concentration penalty already handled by credit capacity. It reached **220 bps** on a
  single invoice — the largest line in the build-up, and double-counted.
- The incumbent was modelled as frictionless apart from spreads: no counterparty credit, no
  correspondent exposure, no principal risk despite having no payment-versus-payment.
- The FX fixing pooled dollar quotes with participating ones, so the published cross rates were
  dollar-derived while the tool claimed measurement independence. See above.
- The sample workbook carried a hard-coded quote timestamp that aged past the §9 staleness window,
  so **"Load sample data" produced nothing at all**. The staleness rule now anchors to the newest
  quote in the file, which is what a fixing window means.

Correcting only those three would have flipped the book to 6/6 the other way, which was equally
suspicious. Two further errors turned out to favour the framework:

- The netting rebate was credited over the whole commercial credit period rather than the settlement
  cycle, overstating it by more than an order of magnitude.
- Correspondent banks were charged for the full credit period rather than the hours a payment is
  actually in flight.

All five are now covered by regression tests, and those tests were mutation-checked: each one fails
when the old behaviour is restored.

## Architecture

```
extension/
  core/         pure computation — no DOM, no network, no storage
    num.js          WLS, OLS with standard errors, robust scale, normal quantiles
    fx-fixing.js    §8 shadow prices, IRLS, §9 outlier rule and fallback hierarchy
    basket.js       §5–§7 constitution, cap-and-redistribute, own-currency-excluded strength
    metrics.js      leading/lagging registry, §11 fixed-reference scoring, horizon blend
    diagnostics.js  §10 CHS, §14 CPS, §16 excess-usage regression, §37 dependency
    netting.js      §19 compression, §20 persistence, §27 symmetric adjustment, stress
    risk.js         §22 waterfall, §24 wrong-way haircuts, §25 supervisory bands
    invoice.js      the price, plus the USD route and §28 adoption cost
    pipeline.js     orchestration
    ingest.js       xlsx/csv/Sheets → canonical tables + a validation report
    schema.js       the workbook contract and its header aliases
    db.js           SQLite (sql.js) over IndexedDB, exportable as a .sqlite file
  agent/
    providers.js    Anthropic · OpenAI · Google · Ollama · Hugging Face · OpenAI-compatible
    agent.js        tool loop with a per-turn context budget
    tools.js        risk-classed tool registry; external calls need approval
    skills.js       runtime-authored skills with reward tracking and retirement
    memory.js       BM25-lite recall with decay and an explicit token budget
    expr.js         safe expression language — arithmetic, never code execution
    mcp.js          MCP over Streamable HTTP / SSE
  panel/          the UI (Tailwind + ECharts)
  content/        the floating overlay
  background/     service worker: LLM calls, MCP, Google Sheets fetch
```

### The floating layer

A closed shadow root hosts a draggable, resizable, collapsible shell containing an
extension-origin `<iframe>`. The iframe means the panel gets the extension's own CSP — so the SQLite
WASM module and the chart library load regardless of the host page's policy — and nothing of the host
page can read the panel or collide with its styles.

### Provider-agnostic by construction

Each provider is one entry in `agent/providers.js` with a `toRequest` and a `fromResponse`. Adding a
vendor touches nothing else. All calls run in the service worker, so API keys never enter a page
context. Ollama and any OpenAI-compatible endpoint (vLLM, LM Studio, Groq, OpenRouter) work the same way.

### The agent evolves, within limits that are actually enforced

| Layer | How it changes | What stops it going wrong |
|---|---|---|
| context | assembled per turn from budgeted memory + active skills | explicit token allowance; what was dropped is reported |
| memory | agent-written, scored, decayed, consolidated | near-duplicate merging, per-kind caps |
| skills | authored at runtime, rewarded, promoted, retired | validated on creation; `reward ≤ 0.25` after 4 uses retires it |
| tools | built-in set plus connected MCP servers | risk classes; external calls need per-call approval |

A "formula" skill is an expression in `expr.js`, parsed to an AST and interpreted — there is no
`eval`, no `new Function`, no property traversal into prototypes. The test suite asserts each of
those escape routes is closed.

MCP tool descriptions and results are treated as untrusted data: instruction-shaped text is redacted
before a model ever sees it, and the agent's system prompt states the rule.

## Development

```bash
npm test                  # 91 assertions over the computational core
npm run check:all         # secrets scan + reference lint + tests
node tools/check-secrets.mjs   # refuses to ship a file containing a credential
node tools/lint-extension.js   # manifest paths, imports, MV3 CSP constraints
npm run watch:css         # rebuild Tailwind on change
node tools/devserver.js   # serve the panel at :8731 with a chrome.* shim
```

The tests assert the identities that must hold exactly — triangular consistency, zero-sum netting,
weights summing to one, components summing to the invoice price — and the behaviours the framework
demands: no cross-sectional min-max normalisation, no diagnostic feedback into the basket, hysteresis
on band upgrades but not downgrades, and reduced coverage reported rather than imputed favourably.

They also assert the *symmetry* of the route comparison, which is where the model went wrong once
already: both routes must bear a conversion cost, both must bear the importer's credit risk differing
only in mitigation, the direct route may not transit the vehicle currency, and widening the
participating crosses must move the comparison monotonically toward the vehicle.

## Limitations

This implements a **research proposal**. The framework's own text identifies its central questions as
untested (§20, §34) — above all whether real BRICS trade flows net efficiently. Prices produced here
are illustrative decompositions computed from the data you supply. They are not quotes, not advice,
and not evidence that the framework works.

The sample dataset is plausible in order of magnitude and is **not** official statistics. Do not cite it.

Several inputs the model wants are published with long lags, incomplete coverage or proprietary
restrictions (§15). Where a value is missing the tool says so and narrows its confidence rather than
filling the gap with something flattering.

## Keys

Add them on the options page, one at a time, or import a whole key file: **Import keys from a file**
takes a `# Label` / `NAME=value` / `label: value` file, detects the provider from each key's format,
shows every key masked, and lets you reassign or skip any of them before storing. The file is read in
the page and each key goes straight to extension storage — it is never logged, never written to the
SQLite database and never included in an export.

`npm run check:secrets` refuses to package anything under `extension/` that contains a credential,
matching on both filename and content. `keys.md`, `.env` and friends are gitignored.

Keys are held in the extension storage of whichever Chrome profile you installed into. They are not
encrypted at rest — anything with access to that profile directory can read them, which is true of
every browser extension. Treat a key file on disk the same way, and rotate anything that has been
displayed, pasted into a terminal, or shared.

## Privacy

Spreadsheets are parsed in the panel and never uploaded. Results live in a local SQLite database in
your browser profile. Google Sheets are fetched with your existing browser session, so private sheets
work without any token being stored. No telemetry. The only outbound calls are to the model provider
you select and to MCP servers you add. API keys are never written to the database, the trace log or
an export.
