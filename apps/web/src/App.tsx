import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ChartDefinition,
  ComputeChartResponse,
  FreshnessEntry,
  MetricDefinition,
  Preset,
} from "@ruckmetrics/contracts";
import { API_URL, errorMessage, isConnectionError, trpc } from "./trpc";
import { Controls } from "./components/Controls";
import { ChartCanvas } from "./components/ChartCanvas";
import { Freshness } from "./components/Freshness";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `preset-${Date.now()}`
  );
}

export default function App() {
  const [metrics, setMetrics] = useState<MetricDefinition[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [def, setDef] = useState<ChartDefinition | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [response, setResponse] = useState<ComputeChartResponse | null>(null);
  const [freshness, setFreshness] = useState<FreshnessEntry[]>([]);
  const [bootError, setBootError] = useState<string | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);

  const reqId = useRef(0);

  // Bootstrap: metrics + presets + freshness.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [cat, list, fresh] = await Promise.all([
          trpc.listMetrics.query({}),
          trpc.listPresets.query(),
          trpc.freshness.query(),
        ]);
        if (!alive) return;
        setMetrics(cat.metrics);
        setPresets(list.presets);
        setFreshness(fresh.entries);
        const first = list.presets[0];
        if (first) {
          setDef(first.definition);
          setActivePresetId(first.id);
        }
      } catch (err) {
        if (!alive) return;
        setBootError(
          isConnectionError(err)
            ? `API not reachable at ${API_URL}. Start the API (npm run api) and reload.`
            : `Failed to load: ${errorMessage(err)}`,
        );
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Re-run the engine whenever the definition changes.
  useEffect(() => {
    if (!def || !def.xMetric) return;
    const id = ++reqId.current;
    setComputing(true);
    setChartError(null);
    (async () => {
      try {
        const res = await trpc.computeChart.query(def);
        if (id !== reqId.current) return;
        setResponse(res);
        if (res.freshness.length > 0) setFreshness(res.freshness);
      } catch (err) {
        if (id !== reqId.current) return;
        setResponse(null);
        setChartError(
          isConnectionError(err)
            ? `API not reachable at ${API_URL}.`
            : errorMessage(err),
        );
      } finally {
        if (id === reqId.current) setComputing(false);
      }
    })();
  }, [def]);

  const onSelectPreset = useCallback(
    (presetId: string) => {
      const p = presets.find((x) => x.id === presetId);
      if (p) {
        setDef(p.definition);
        setActivePresetId(p.id);
      }
    },
    [presets],
  );

  const onChange = useCallback((next: ChartDefinition) => {
    setDef(next);
    setActivePresetId(null); // definition edited by hand => no longer a named preset
  }, []);

  const onSavePreset = useCallback(async () => {
    if (!def) return;
    const name = window.prompt("Preset name");
    if (!name) return;
    const preset: Preset = {
      id: slugify(name),
      name,
      description: "",
      specRef: "user",
      definition: def,
    };
    try {
      const saved = await trpc.savePreset.mutate(preset);
      setPresets((prev) => {
        const without = prev.filter((p) => p.id !== saved.id);
        return [...without, saved];
      });
      setActivePresetId(saved.id);
    } catch (err) {
      window.alert(`Save failed: ${errorMessage(err)}`);
    }
  }, [def]);

  if (bootError) {
    return (
      <div className="app app--error">
        <div className="boot-error">
          <h1>RuckMetrics</h1>
          <p className="error-banner">{bootError}</p>
        </div>
      </div>
    );
  }

  if (!def) {
    return (
      <div className="app app--loading">
        <p className="muted">Loading engine…</p>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="topbar__title">RuckMetrics</h1>
        <span className="topbar__sub">
          Configurable rugby analytics engine
          {activePresetId ? ` · ${presets.find((p) => p.id === activePresetId)?.name ?? ""}` : " · custom view"}
        </span>
        {computing && <span className="topbar__status">computing…</span>}
      </header>

      <div className="layout">
        <Controls
          def={def}
          metrics={metrics}
          presets={presets}
          activePresetId={activePresetId}
          onChange={onChange}
          onSelectPreset={onSelectPreset}
          onSavePreset={onSavePreset}
        />

        <main className="main">
          {chartError && <p className="error-banner">{chartError}</p>}
          {response ? (
            <ChartCanvas response={response} scope={def.scope} />
          ) : (
            !chartError && <p className="muted">Computing chart…</p>
          )}
        </main>

        <section className="details">
          <div className="panel">
            <h3 className="panel__title">Definition</h3>
            <dl className="def-list">
              <dt>Chart</dt>
              <dd>{def.chartType}</dd>
              <dt>Scope</dt>
              <dd>{def.scope}</dd>
              <dt>X</dt>
              <dd>{def.xMetric}</dd>
              <dt>Y</dt>
              <dd>{def.yMetric ?? "—"}</dd>
              <dt>Size</dt>
              <dd>{def.sizeMetric ?? "—"}</dd>
              <dt>Comp/Season</dt>
              <dd>
                {def.competition} · {def.season}
              </dd>
              <dt>Values</dt>
              <dd>{def.percentileMode}</dd>
              <dt>Benchmark</dt>
              <dd>{def.benchmarkOverlay}</dd>
            </dl>
          </div>
          <div className="panel">
            <Freshness entries={freshness} />
          </div>
        </section>
      </div>
    </div>
  );
}
