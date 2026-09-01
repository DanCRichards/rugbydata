# RuckMetrics

A configurable engine for **bivariate statistical analysis of rugby players and teams**.
Pick any two metrics as X/Y axes, optionally a third as marker size, filter by
position / competition / season, toggle raw vs positional-percentile values, and
overlay a benchmark median. The ~22 named analyses in the spec are **seed presets
over one engine** — not bespoke pages.

## Design principle: engineering first

The system is layered and each layer is independently testable. Business logic
lives in the lower layers, never in the UI.

```
ingestion  →  normalized store  →  derivation  →  typed API  →  frontend
(adapters)    (DuckDB)             (pure fns)     (tRPC)        (one engine)
      \___________________ typed contracts (zod) ______________________/
```

Everything crosses layer boundaries as **schema-validated typed contracts**
(`@ruckmetrics/contracts`, zod). A single **metrics registry** is the source of
truth every layer reads from.

## Packages

| Package | Role |
| --- | --- |
| `@ruckmetrics/contracts` | Zod schemas + types for entities, the metrics registry, normalized records (with provenance), the `ChartDefinition`, and every API request/response. Validated at every boundary. |
| `@ruckmetrics/registry` | The **single metrics registry** (40 metrics: id, label, unit, scope, applicable positions, aggregation, normalization basis, provenance, availability flag) and the **22 seed presets** as `ChartDefinition`s. |
| `@ruckmetrics/store` | Normalized DuckDB store. Fact rows keep raw values in a JSON column (schema-stable as metrics grow) plus provenance + fetch timestamp. Typed repository; queryable data-freshness. |
| `@ruckmetrics/derivation` | **Pure, deterministic, unit-tested** functions: positional percentiles (within position group), per-80 / per-ruck / per-100-ruck / per-visit / per-carry normalization, benchmark medians. Fails loud on malformed data; never imputes. |
| `@ruckmetrics/ingestion` | Provider/adapter pattern: `rugbypy` box-score spine, a rate-limited RugbyPass embedded-JSON scraper, official match-centre lineout adapter, and a paid-provider stub. Idempotent cached ETL into DuckDB, plus a deterministic `seed`. |
| `@ruckmetrics/api` | Typed **tRPC** API: `listMetrics` (with availability), `queryCohort`, `computeChart(chartDefinition)`, `listPresets` / `loadPreset` / `savePreset`, `freshness`. Input **and** output schema-validated. |
| `apps/web` | **One** configurable chart engine driven by the `ChartDefinition` schema. Every named analysis is a preset. |

## The single engine

Every analysis is one object:

```ts
type ChartDefinition = {
  scope: "PLAYER_CLUB" | "TEAM_TEST";
  chartType: "scatter" | "radar" | "groupedBar" | "stackedBar" | "strip";
  xMetric: string;
  yMetric?: string | null;
  sizeMetric?: string | null;
  positionFilter?: { groups: PositionGroup[]; broad: "forwards" | "backs" | null };
  competition: Competition;
  season: Season;
  percentileMode: "raw" | "positional";
  benchmarkOverlay: "none" | "twelveSquadMedian" | "testMedian";
  axisFlips: { x: boolean; y: boolean };
  categoryMetrics?: string[]; // radar / grouped-bar
  stackMetrics?: string[];    // stacked-bar
};
```

`computeChart` composes store (data) + registry (metric semantics) + derivation
(maths). There is no per-analysis code path.

## Data availability & the paid slot

Every metric carries an availability flag:

- **FREE** — scrapeable now (rugbypy / RugbyPass / match centre).
- **DERIVE** — computed deterministically from free box-score fields.
- **PAID_UNAVAILABLE** — needs an event feed (Opta/Sportradar). The metric is
  **registered and wired**, the adapter slot is ready, but no data is produced;
  the frontend disables it in the pickers and any preset that needs it renders
  empty with an explicit notice. Dropping in a paid adapter requires no
  downstream changes.

12 presets ship fully on free data; the rest are wired and waiting on a paid feed.

## Handling missing data

Never silently imputed. A subject missing a plotted value is **excluded with a
counted warning**; malformed data (e.g. a rate numerator with no denominator)
**throws** (`DataIntegrityError`). Both are surfaced, never guessed around.

## Commands

```bash
npm install            # install workspace deps

npm run seed           # generate a deterministic demo dataset into ./data/ruckmetrics.duckdb
npm run etl            # run the real adapter pipeline (falls back to fixtures when live sources are unavailable)

npm run api            # start the tRPC API on :4000
npm run web            # start the Vite frontend

npm run typecheck      # typecheck all packages
npm run test           # run all unit/integration tests
```

Set `RUCKMETRICS_DB` to point the store elsewhere; set `VITE_API_URL` for the
frontend (default `http://localhost:4000`).

## Provenance & freshness

Every stored row records its source and fetch timestamp. `freshness` (API) and
the frontend surface per-source row counts and the newest/oldest fetch times.

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` runs the pipeline and publishes a **self-contained
static build of the engine** to GitHub Pages on every push:

1. install → `typecheck` → `test` (quality gate: 74 tests)
2. `npm run seed` — full deterministic cohort through the real normalization /
   derivation pipeline
3. `npm run etl` — real adapters, best-effort; in GitHub's runners the live
   rugbypy / RugbyPass / match-centre feeds are unreachable, so the adapters fall
   back to their recorded fixtures and layer any fetched rows on top of the seed
4. `npm run build:site` — export the computed values (`scripts/export-artifact-data.mts`)
   and inline them into `site/template.html`, emitting `site/dist/index.html`
5. deploy `site/dist` to Pages

Static hosting serves files only, so the tRPC API and DuckDB do **not** run on
Pages — the page reads the pipeline-generated data baked in at build time and
recomputes chart definitions client-side (identical availability gating and
transparent-exclusion rules as the server). To run the full stack with the live
API, use `npm run dev` locally or host the API on a Node platform.

**One-time setup:** in the repo, **Settings → Pages → Build and deployment →
Source → GitHub Actions**. The next push (or a manual *Run workflow*) publishes
the site. Build it locally with `npm run seed && npm run build:site` then open
`site/dist/index.html`.
