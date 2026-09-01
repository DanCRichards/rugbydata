# AGENTS.md — @ruckmetrics/registry (the single source of truth)

See the root [`AGENTS.md`](../../AGENTS.md) for the full contract. This package is where
metrics and presets are **defined** — every other layer reads from here, so changes here
ripple everywhere. Keep it authoritative and minimal.

**Adding/changing a metric** (`src/metrics.ts`): add a `MetricDefinition` to `PLAYER_METRICS`
or `TEAM_METRICS`. Ids are globally unique (a load-time guard throws on duplicates). Set
`availability` to `FREE`, `DERIVE`, or `PAID_UNAVAILABLE` (underscore) honestly — a metric with
no producing adapter is `PAID_UNAVAILABLE`, not `FREE`.

**Adding a preset** (`src/presets.ts`): use the `preset({ id, name, specRef, description, def })`
helper. `def` is a partial `ChartDefinition`; specify only what differs from the defaults. Every
metric id referenced must exist in the registry.

**After any change:** `npm test -w @ruckmetrics/registry` and `npx tsx scripts/verify-presets.mts`
(from repo root) must pass. Do not hard-code metric lists in other packages — they import from here.
