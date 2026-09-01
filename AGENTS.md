# AGENTS.md — RuckMetrics

Operational guide for AI coding agents (OpenAI Codex and compatible tools) working in
this repository. Codex reads the nearest `AGENTS.md` automatically; treat this as the
working contract for *how* to make changes here. For the architectural tour and the
product spec, read [`README.md`](./README.md) first — this file does not repeat it.

> TL;DR: TypeScript ESM monorepo (npm workspaces, Node ≥ 22). Layered pipeline
> `ingestion → store(DuckDB) → derivation → api(tRPC) → apps/web(React)`, all crossing
> boundaries as zod-validated contracts. One metrics **registry** is the source of truth.
> Verify every change with `npm run typecheck && npm test`.

---

## 1. Golden rules (do not violate)

These are load-bearing invariants. Breaking one is a defect even if types pass.

1. **The registry is the single source of truth.** Every metric and preset lives in
   `@ruckmetrics/registry` (`metrics.ts`, `presets.ts`). No layer hard-codes a metric
   list or its semantics — they read it from the registry. Add/change metrics there,
   never inline in the store, api, derivation, or frontend.
2. **One engine, no per-analysis code paths.** Every named analysis is a `ChartDefinition`
   object (a preset), computed by the single `computeChart` function. Never add a bespoke
   endpoint or component for a specific chart — add a preset.
3. **Contracts at every boundary.** Data crossing a layer boundary is validated against a
   zod schema from `@ruckmetrics/contracts`. tRPC procedures validate **input and output**.
   When you change a shape, change the contract schema first, then let types propagate.
4. **Never impute missing data.** A subject with no value for a plotted metric is
   **excluded and counted** (aggregate fns return `null`; the caller surfaces a warning).
   Malformed/self-contradictory data **throws `DataIntegrityError`** — never silently
   corrected. Do not add fallbacks, zero-fills, or averages to "fix" missing data.
5. **Derivation is pure and deterministic.** Functions in `@ruckmetrics/derivation` take
   data in and return numbers out — no I/O, no clock, no randomness, no DB access. They
   are unit-tested in isolation and must stay that way.
6. **Dependency direction is one-way.** `contracts` depends on nothing internal. Everything
   depends on `contracts`. `registry → contracts`; `store → contracts`;
   `derivation → contracts`; `ingestion → contracts, registry, store`;
   `api → contracts, registry, store, derivation`; `apps/web → contracts, api (types only)`.
   Never introduce a back-edge (e.g. `contracts` importing `store`).

---

## 2. Repository map

```
package.json            # root: npm workspaces, orchestration scripts
tsconfig.base.json      # strict TS config every package extends
README.md               # architecture + product spec (read this first)
AGENTS.md               # you are here

packages/
  contracts/   @ruckmetrics/contracts   zod schemas + shared types. Depends on nothing internal.
    src/entities.ts   Team, Player, PositionGroup, Scope, Competition, Season
    src/metrics.ts    Availability enum, MetricDefinition, MetricsCatalog, isAvailable()
    src/records.ts    MatchStatRecord (raw values in a JSON column) + provenance
    src/chart.ts      ChartDefinition, Preset — THE engine's input object
    src/api.ts        request/response schema for every tRPC procedure
    src/index.ts      barrel (re-exports all of the above)

  registry/    @ruckmetrics/registry   the single source of truth
    src/metrics.ts    ALL_METRICS (40), getMetric/metricsForScope, load-time dup guard
    src/presets.ts    SEED_PRESETS (22 ChartDefinitions), preset() helper
    src/index.ts      barrel

  store/       @ruckmetrics/store      normalized DuckDB store
    src/config.ts     databasePath() — resolves <repo-root>/data, overridable via RUCKMETRICS_DB
    src/db.ts         Db.open() (creates parent dir), thin DuckDB wrapper, close()
    src/schema.ts     table DDL / migrations
    src/repository.ts Repository: upsert*, getCohort, allPlayers/Teams, freshness
    src/index.ts      barrel

  derivation/  @ruckmetrics/derivation PURE, deterministic, unit-tested maths
    src/errors.ts     DataIntegrityError
    src/stats.ts      percentiles, medians
    src/aggregate.ts  per-80 / per-ruck / per-100-ruck / per-visit / per-carry normalization
    src/cohort.ts     cohortRawValues, positionalPercentileValues
    src/index.ts      barrel

  ingestion/   @ruckmetrics/ingestion  adapters + ETL + deterministic seed
    src/adapter.ts             DataSourceAdapter interface
    src/adapters/rugbypy.ts    box-score spine (merge order first)
    src/adapters/matchcentre.ts official match-centre lineout adapter
    src/adapters/rugbypass.ts  rate-limited embedded-JSON scraper
    src/adapters/paid-stub.ts  paid-provider slot (produces no data yet)
    src/cache.ts, rate-limiter.ts, prng.ts   ETL plumbing (idempotent cache, deterministic PRNG)
    src/etl.ts                 merges adapters → validated MatchStatRecords → DuckDB
    src/seed.ts                deterministic demo-dataset generator
    src/cli/seed.ts            `npm run seed`  entrypoint
    src/cli/etl.ts             `npm run etl`   entrypoint

  api/         @ruckmetrics/api        typed tRPC API
    src/router.ts     appRouter: listMetrics, queryCohort, computeChart, presets, freshness
    src/compute.ts    computeChart() — composes store + registry + derivation (THE engine)
    src/context.ts    per-request context (opens the Repository)
    src/presetStore.ts save/load user presets
    src/server.ts     standalone HTTP server (`npm run api`, :4000)
    src/index.ts      exports appRouter + AppRouter type for the frontend

apps/
  web/         @ruckmetrics/web        React + Vite frontend (one configurable engine)
    src/App.tsx, components/, domain.ts, scale.ts, trpc.ts

scripts/       build/verification scripts (run with tsx / node)
  export-artifact-data.mts  export computed pipeline data → site/data.json (for the static build)
  build-site.mjs            inline data into site/template.html → site/dist/index.html
  assert-data.mjs           plain-fs gate: fail if exported data is missing/too thin
  verify-presets.mts        validate every preset against the registry + contracts

site/          static-site build inputs/outputs (template.html, generated dist/)
.github/workflows/deploy.yml   CI: quality gate → seed → etl → build → deploy to Pages
```

---

## 3. Commands

Run from the repo root unless noted. Node ≥ 22 is required.

| Task | Command |
| --- | --- |
| Install | `npm install` |
| Typecheck everything | `npm run typecheck` |
| Test everything (the quality gate) | `npm test` |
| Test one package | `npm test -w @ruckmetrics/derivation` |
| Test one file / one case | `cd packages/derivation && npx vitest run cohort` · add `-t "name"` |
| Seed a deterministic DB | `npm run seed` → `./data/ruckmetrics.duckdb` |
| Run the real adapter ETL | `npm run etl` (falls back to fixtures when live sources are offline) |
| Start API (:4000) | `npm run api` |
| Start frontend | `npm run web` |
| Full local stack | `npm run dev` (seed → api + web concurrently) |
| Build the static site | `npm run seed && npm run build:data && npm run assert:data && npm run build:site` → open `site/dist/index.html` |

**Always run `npm run typecheck && npm test` before considering a change done.** There is
no separate linter — `npm run lint` aliases typecheck, and strict TS (below) is the lint.

---

## 4. Code conventions

- **ESM only, with explicit `.js` import extensions in TypeScript source.** Even though
  files are `.ts`, imports of sibling modules end in `.js` (e.g. `import { x } from "./errors.js"`).
  Match this — a missing/incorrect extension breaks the build.
- **Barrel exports.** Each package exposes a `src/index.ts` that re-exports its public API.
  Import from the package name (`@ruckmetrics/contracts`), not deep paths, across packages.
- **Strict TypeScript** (`tsconfig.base.json`): `strict`, `noUncheckedIndexedAccess`,
  `noUnusedLocals`, `noUnusedParameters`, `noImplicitOverride`. Unused vars and
  unchecked indexing are errors — no dead code, guard array access.
- **zod is the type origin at boundaries.** Define the schema, then `z.infer` the type.
  Don't hand-write a type that duplicates a schema.
- **Fail loud.** Prefer throwing a named, explanatory error over returning a silent default.
  The registry throws on duplicate/unknown metric ids at load; derivation throws
  `DataIntegrityError` on malformed data. Follow that posture.
- **Tests are co-located or in `test/`** (both patterns exist), always `*.test.ts`, run by
  **vitest**. New logic ships with a test. Pure derivation logic gets unit tests; the api's
  `computeChart` gets integration-style tests over a seeded/in-memory repo.

---

## 5. Common recipes

### Add or change a metric
1. Edit `packages/registry/src/metrics.ts` — add a `MetricDefinition` to `PLAYER_METRICS`
   or `TEAM_METRICS` (id, label, unit, scope, applicable positions, aggregation basis,
   normalization, provenance, `availability`). Ids must be unique (guarded at load).
2. If it needs new source data, produce it in an ingestion adapter and ensure the ETL/seed
   populates it; otherwise mark it `PAID_UNAVAILABLE` (registered + wired, no data yet).
3. Update `packages/registry/test/registry.test.ts` and run `npx tsx scripts/verify-presets.mts`.

### Add a preset (a named analysis)
- Edit `packages/registry/src/presets.ts` using the `preset({ id, name, specRef, description, def })`
  helper. `def` is a partial `ChartDefinition`; only the axes/filters that differ from the
  defaults are needed. Every metric id in `def` must exist in the registry and (for it to
  render with data) be available. Run `npx tsx scripts/verify-presets.mts` to validate.

### Add a data source
- Implement `DataSourceAdapter` (`packages/ingestion/src/adapter.ts`) in
  `packages/ingestion/src/adapters/`, add it to `defaultAdapters()` in `src/index.ts` in the
  correct **merge order** (box-score spine first), and give it a recorded fixture so the
  offline fallback path is testable. The `paid-stub.ts` is the template for a wired-but-empty
  provider.

### Change an API shape
- Edit the schema in `packages/contracts/src/api.ts` (or the underlying entity/chart schema),
  then update the tRPC procedure in `packages/api/src/router.ts`. Because output is validated
  and `AppRouter` flows to `apps/web`, the frontend will type-error until updated — that's the
  contract working.

---

## 6. Gotchas (learned the hard way)

- **DuckDB is an alpha native binding (`@duckdb/node-api`) and can segfault (exit 139)
  during process *teardown*** on some machines/CI runners — *after* data is durably
  committed. Mitigations already in place, keep them:
  - The `seed`/`etl` CLIs call `process.exit(0)` on success to skip the crash-prone
    native finalizer once writes are committed. Don't remove that.
  - `scripts/export-artifact-data.mts` writes its output file **before** any teardown, then
    `process.exit(0)`.
  - In CI, the DuckDB-touching steps run `continue-on-error` and the real gate is
    `scripts/assert-data.mjs` — a **plain-fs** check (no DuckDB, so it cannot segfault).
  - `Db.close()` only fire-and-forgets the connection disconnect; the instance is reclaimed
    at exit. If you refactor teardown, preserve "data is flushed before exit."
- **`databasePath()` resolves from the store package's own location, not `process.cwd()`**
  (workspace scripts change cwd). Override only via the `RUCKMETRICS_DB` env var. Don't
  reintroduce cwd-relative paths.
- **The static site (GitHub Pages) has no server/DuckDB at runtime.** `site/template.html`
  recomputes chart definitions **client-side** from data baked in at build time, and must
  reproduce the server's availability gating and transparent-exclusion rules. If you change
  those rules in `api/compute.ts` or `derivation`, mirror them in `site/template.html`.
- **The data gate expects a populated cohort.** `assert-data.mjs` fails the build if the
  exported data is missing or too thin (metrics/presets counts, club cohort size, a test
  cohort present). If you legitimately change metric/preset counts, update the thresholds.
- **Availability values are `FREE` | `DERIVE` | `PAID_UNAVAILABLE`** (note the underscore).
  `isAvailable(m)` is true for everything except `PAID_UNAVAILABLE`.

---

## 7. Verifying a change (definition of done)

1. `npm run typecheck` — clean.
2. `npm test` — all green (the CI quality gate is these tests).
3. If you touched metrics/presets: `npx tsx scripts/verify-presets.mts`.
4. If you touched the pipeline, store, or the static export/site:
   `npm run seed && npm run build:data && npm run assert:data && npm run build:site`,
   then sanity-check `site/dist/index.html`.
5. Keep changes within the layer they belong to and respect the one-way dependency rule.

If a task is ambiguous about which layer owns a change, prefer the lowest layer that makes
the fix general (usually the registry or a contract), not the UI.
