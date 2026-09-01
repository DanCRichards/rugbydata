# @ruckmetrics/web

The RuckMetrics frontend: a single configurable chart engine driven by a
`ChartDefinition`. There are no per-analysis pages — every one of the 22 seed
presets is just a `ChartDefinition` fed to the same engine.

## Run

```bash
npm run dev -w @ruckmetrics/web      # vite dev server (default http://localhost:5173)
npm run build -w @ruckmetrics/web    # production build -> dist/
npm run typecheck -w @ruckmetrics/web
```

The API base URL is configurable via **`VITE_API_URL`** (default
`http://localhost:4000`, the standalone tRPC API). Example:

```bash
VITE_API_URL=http://localhost:4000 npm run dev -w @ruckmetrics/web
```

## Design

- `src/trpc.ts` — the fully-typed vanilla tRPC v11 client. `AppRouter` is
  imported **type-only** so no server code is bundled.
- `src/domain.ts` — runtime enum vocabulary + helpers (mirrored locally, checked
  against the contract types).
- `src/App.tsx` — holds the current `ChartDefinition`; any control edit re-runs
  `computeChart`.
- `src/components/Controls.tsx` — every control edits the definition.
- `src/components/ChartCanvas.tsx` — dispatches on `response.chartType` to the
  hand-rolled SVG charts (`ScatterChart`, `StripChart`, `RadarChart`, `BarChart`).
