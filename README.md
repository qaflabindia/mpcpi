# MPCPI — Multipolar Currency Pricing & Invoicing

MPCPI is a Chrome extension that implements the BCC-T / BCC-C / BCC-D framework set out in
[`docs/BCC-FRAMEWORK.md`](docs/BCC-FRAMEWORK.md). It reads a Google Sheet, Excel workbook or CSV,
and from it:

- fixes a triangularly consistent cross-rate matrix among the participating currencies;
- constitutes the BCC-T basket;
- scores each economy's currency health, including a debt-adjusted value;
- nets the obligation matrix;
- prices each invoice as a sum of named components, beside the same invoice routed through the dollar.

**Status.** This implements a research proposal. Its outputs are illustrative decompositions of the
data you supply. They are not quotes, not advice, and not evidence that the framework works. The
built-in sample data is plausible in order of magnitude but is not official statistics.

## Documents

| file | contents |
|---|---|
| [`docs/BCC-FRAMEWORK.md`](docs/BCC-FRAMEWORK.md) | the framework paper; section numbers (§) below refer to it |
| [`docs/DEBT-ADJUSTED-VALUE.md`](docs/DEBT-ADJUSTED-VALUE.md) | method for valuing every currency, the dollar included, against its government's debt |
| [`docs/REVIEW.md`](docs/REVIEW.md) | referee report on the framework, written after implementing it |

## Pipeline

```
workbook ─► ingest       column mapping, validation report
        ─► fixing  §8    participating currencies fitted alone; USD attached afterwards as a
                         satellite that can be quoted and paid but does not influence the fit
        ─► basket  §6    fixed quantity vector, weight cap with redistribution
        ─► diagnostics   health (§10–§13), usage (§14), excess usage (§16),
                         leading vs lagging (§15), debt-adjusted value
        ─► netting §19   multilateral compression, creditor persistence (§20), stress
        ─► invoice       price build-up, and the dollar route priced in parallel
```

Diagnostics never feed back into the basket (§4). A test confirms this: tripling every country's
debt ratio leaves every basket quantity unchanged.

## Method

### FX fixing (§8)

Each currency gets one shadow log-price, estimated by weighted least squares, so that
`FX_ij · FX_jk = FX_ik` holds exactly. Only quotes with **both** legs in participating currencies
enter the fit. External currencies are attached afterwards against the fixed participant block.

The reason for the split: in a pooled fit, dollar legs carry most of the weight because they are the
deepest and tightest quotes. A direct cross that disagrees with the dollar-implied rate is then
outvoted and rejected as an outlier, and the published "BRICS" matrix is the dollar's rate structure
under another name. Tests confirm that moving the dollar legs alone cannot shift any participating
rate.

If the participating quotes do not connect every currency, the fixing refuses to publish a matrix
rather than readmitting the dollar.

### Invoice price

Costs are split into those common to both routes and those specific to each, because the common
block is large enough to hide the difference.

```
COMMON   forward carry (§23) + unhedged FX risk (§23) + leading/lagging adjustment (§15)

DIRECT   conversion via the cheapest path that does not transit USD (§8, §28)
         + counterparty credit, mitigated by the CCP (§25) + margin funding (§18, §25)
         + clearing fee (§18) − netting rebate over the settlement cycle (§19)
         + wrong-way loading (§24)

VIA USD  two conversion legs + two settlement fees + correspondent fees
         + unmargined counterparty credit + in-flight correspondent exposure
         + principal risk (no payment-versus-payment) + nostro float; no netting
```

Two verdicts are reported. The infrastructure verdict compares the route-specific costs only. The
all-in verdict also includes the extra settlement day on the dollar route, which comes from the
settlement calendar rather than the clearing design.

### Leading and lagging indicators (§15)

```
w_L(T)     = exp(−T / τ)                              τ = 90 days by default
Composite  = w_L · Leading + (1 − w_L) · Lagging
Divergence = Leading − Lagging                        reported separately, as an early warning
```

Every indicator is scored against a fixed reference distribution (§11), not min-max scaling across
countries, so a score keeps its meaning from year to year.

### Debt-adjusted value

```
pb*  = d·(r − g)/(1 + g)          primary balance that holds debt/GDP constant
gap  = pb* − pb                   fiscal shortfall, share of GDP per year
π_x  = gap / (d·(1 − s) − gap)    extra annual inflation if the gap is closed by monetisation
V_H  = (1 + π_x)^(−H)             purchasing power remaining after H years
```

Here *d* is debt/GDP, *pb* the primary balance, *r* the effective interest rate, *g* nominal growth
and *s* the foreign-currency share of debt, which cannot be inflated away. The same function is
applied to every economy. Economies outside the basket, such as the US, enter as **reference
economies**: they are scored on the same rules but take no part in the basket or in clearing. The
result is an upper bound on one channel, not a forecast. See
[`docs/DEBT-ADJUSTED-VALUE.md`](docs/DEBT-ADJUSTED-VALUE.md).

## Results on the sample data

The sample data is illustrative. These figures describe how the model behaves, not the world.

**Route comparison.** Over six invoices, the median common block is 574 bps. The median
infrastructure difference between the two routes is 3.4 bps, in favour of the direct route on 6 of 6
invoices. The advantage comes from CCP credit mitigation and netting. Wider participating crosses
offset it:

| participating spreads | direct (median) | via USD (median) | direct cheaper |
|---|---|---|---|
| as quoted | 9.73 bps | 11.12 bps | 6 / 6 |
| 3× wider | 23.02 bps | 19.35 bps | 1 / 6 |
| 10× wider | 61.31 bps | 19.35 bps | 0 / 6 |

This is consistent with §28: the obstacle is liquidity, not technology.

**Netting.** Multilateral netting saves 72% of gross settlement liquidity. CN is a structural
creditor in all twelve periods (lag-1 autocorrelation 0.83), so the §26 creditor-asset problem
binds.

**Early warning.** RU's leading index is 22.2 against a lagging index of 51.6, a divergence of
−29.4: markets have deteriorated ahead of fundamentals.

**Debt-adjusted value.** At a 10-year horizon, the US loses 17% of purchasing power on the
monetisation bound. Russia, Brazil, China and South Africa lose more; India loses none. The US
inputs are published FY2026 federal figures; the member inputs are illustrative.

## Install

```bash
npm install && npm run build:css
./run.sh
```

`run.sh` opens a separate Chrome profile on `chrome://extensions` with Developer mode enabled.
Choose **Load unpacked** and select `mpcpi/extension`, the folder that contains `manifest.json`, not
the repository root. Chrome 137 removed the `--load-extension` flag, so this step is manual.

Open the panel with **Alt+Shift+M** or the toolbar icon. On a Google Sheets tab, right-click →
*Load this Google Sheet into MPCPI*. The arithmetic needs no API key; only the Agent tab uses a
model provider.

## Panel

| tab | shows |
|---|---|
| Data | ingestion report; every uncertain column match and coerced cell |
| Fixing | rates quoted in BCC-T, input triangle inconsistency against the fitted matrix |
| Basket | weights, the binding cap, self-reference attenuation (§7) |
| Diagnostics | leading vs lagging, excess-usage regression with standard errors, debt-adjusted value |
| Netting | compression, creditor persistence, stress |
| Invoice | line-by-line price and the route comparison |
| Workings | every published figure re-derived step by step and reconciled against the published value |
| Agent | model-driven analyst that reads results through tools; computes nothing itself |

## Architecture

```
extension/
  core/        pure computation: no DOM, network or storage
    num.js            WLS, OLS with standard errors, robust scale, normal quantiles
    fx-fixing.js      §8 shadow prices, IRLS, §9 outlier rule
    basket.js         §5–§7 constitution, cap and redistribution, strength index
    metrics.js        indicator registry, §11 fixed-reference scoring, horizon blend
    diagnostics.js    §10 CHS, §14 CPS, §16 excess usage, §37 dependency
    fiscal-backing.js debt-adjusted value
    netting.js        §19 compression, §20 persistence, §27 symmetric adjustment
    risk.js           §22 waterfall, §24 wrong-way haircuts, §25 supervisory bands
    invoice.js        invoice price, dollar route, §28 adoption cost
    explain.js        step-by-step derivations with reconciliation
    pipeline.js       orchestration
    ingest.js, schema.js, db.js   workbook contract, ingestion, SQLite store
  agent/       provider-agnostic tool loop, MCP client, safe expression language
  panel/       UI (Tailwind, ECharts)
  content/     floating overlay (closed shadow root hosting an extension-origin iframe)
  background/  service worker: model calls, MCP, Google Sheets fetch
```

The agent's "formula" skills are parsed and interpreted by `expr.js`. There is no `eval` or
`new Function`, and the tests check that each escape route is closed. MCP tool descriptions and
results are treated as untrusted, and instruction-like text is redacted before a model sees it.

## Development

```bash
npm test                        # 136 assertions over the computational core
npm run check:all               # secrets scan + reference lint + tests
node tools/devserver.js         # panel at http://localhost:8731/panel/index.html
npm run watch:css               # rebuild Tailwind on change
```

Tests check the identities that must hold exactly: triangular consistency, zero-sum netting,
weights summing to one, and components summing to the invoice price. They also check behaviour the
framework requires:

- no min-max normalisation;
- no diagnostic feedback into the basket;
- hysteresis on band upgrades only;
- missing data reported rather than imputed favourably;
- the route comparison is symmetric: both routes bear conversion and credit costs, and wider
  participating crosses move the result toward the dollar.

## Keys and privacy

API keys are added on the options page, one at a time or from a key file. They are stored in the
extension storage of the Chrome profile you installed into. They are not encrypted at rest, are
never written to the database or an export, and model calls run in the service worker, so keys never
enter a page context. `npm run check:secrets` refuses to package any file under `extension/` that
contains a credential.

Spreadsheets are parsed locally and never uploaded. Results are kept in a local SQLite database.
Google Sheets are fetched with your existing browser session. There is no telemetry. The only
outbound calls go to the model provider and MCP servers you configure.
