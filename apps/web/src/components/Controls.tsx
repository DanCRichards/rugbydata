import type {
  BenchmarkOverlay,
  BroadPositionGroup,
  ChartDefinition,
  ChartType,
  Competition,
  MetricDefinition,
  PercentileMode,
  PositionGroup,
  Preset,
  Scope,
} from "@ruckmetrics/contracts";
import {
  BENCHMARK_OVERLAYS,
  BROAD_GROUPS,
  COMPETITIONS_BY_SCOPE,
  PAID_TOOLTIP,
  PERCENTILE_MODES,
  POSITION_GROUPS,
  SCOPES,
  SEASONS_BY_SCOPE,
  availabilityBadge,
  defaultCompetition,
  defaultSeason,
  isMetricAvailable,
} from "../domain";

interface Props {
  def: ChartDefinition;
  metrics: MetricDefinition[];
  presets: Preset[];
  activePresetId: string | null;
  onChange: (def: ChartDefinition) => void;
  onSelectPreset: (id: string) => void;
  onSavePreset: () => void;
}

const CHART_TYPES: readonly { value: ChartType; label: string }[] = [
  { value: "scatter", label: "Scatter" },
  { value: "strip", label: "Ranked strip" },
  { value: "radar", label: "Radar" },
  { value: "groupedBar", label: "Grouped bar" },
  { value: "stackedBar", label: "Stacked bar" },
];

export function Controls({
  def,
  metrics,
  presets,
  activePresetId,
  onChange,
  onSelectPreset,
  onSavePreset,
}: Props) {
  const scopeMetrics = metrics.filter((m) => m.scope === def.scope);

  const patch = (p: Partial<ChartDefinition>) => onChange({ ...def, ...p });

  const changeScope = (scope: Scope) => {
    if (scope === def.scope) return;
    const avail = metrics.filter((m) => m.scope === scope && isMetricAvailable(m));
    onChange({
      ...def,
      scope,
      chartType: "scatter",
      xMetric: avail[0]?.id ?? "",
      yMetric: avail[1]?.id ?? null,
      sizeMetric: null,
      positionFilter: { groups: [], broad: null },
      competition: defaultCompetition(scope),
      season: defaultSeason(scope),
      categoryMetrics: [],
      stackMetrics: [],
    });
  };

  const toggleGroup = (g: PositionGroup) => {
    const has = def.positionFilter.groups.includes(g);
    const groups = has
      ? def.positionFilter.groups.filter((x) => x !== g)
      : [...def.positionFilter.groups, g];
    patch({ positionFilter: { ...def.positionFilter, groups } });
  };

  const setBroad = (broad: BroadPositionGroup | null) =>
    patch({ positionFilter: { ...def.positionFilter, broad } });

  return (
    <aside className="controls">
      {/* Preset picker */}
      <section className="control">
        <label className="control__label">Preset</label>
        <select
          value={activePresetId ?? ""}
          onChange={(e) => e.target.value && onSelectPreset(e.target.value)}
        >
          <option value="">— custom —</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.specRef ? `${p.specRef} · ` : ""}
              {p.name}
            </option>
          ))}
        </select>
      </section>

      {/* Scope */}
      <section className="control">
        <label className="control__label">Scope</label>
        <div className="segmented">
          {SCOPES.map((s) => (
            <button
              key={s.value}
              className={def.scope === s.value ? "seg seg--on" : "seg"}
              onClick={() => changeScope(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      {/* Chart type */}
      <section className="control">
        <label className="control__label">Chart type</label>
        <select value={def.chartType} onChange={(e) => patch({ chartType: e.target.value as ChartType })}>
          {CHART_TYPES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </section>

      {/* Axis metrics */}
      <MetricPicker
        label="X metric"
        value={def.xMetric}
        metrics={scopeMetrics}
        onChange={(id) => {
          if (id) patch({ xMetric: id });
        }}
      />
      <MetricPicker
        label="Y metric"
        value={def.yMetric}
        metrics={scopeMetrics}
        optional
        onChange={(id) => patch({ yMetric: id })}
      />
      <MetricPicker
        label="Size metric"
        value={def.sizeMetric}
        metrics={scopeMetrics}
        optional
        onChange={(id) => patch({ sizeMetric: id })}
      />

      {/* Competition + season */}
      <section className="control">
        <label className="control__label">Competition</label>
        <select
          value={def.competition}
          onChange={(e) => patch({ competition: e.target.value as Competition })}
        >
          {COMPETITIONS_BY_SCOPE[def.scope].map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </section>
      <section className="control">
        <label className="control__label">Season</label>
        <select value={def.season} onChange={(e) => patch({ season: e.target.value })}>
          {SEASONS_BY_SCOPE[def.scope].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </section>

      {/* Position filter — player scope only */}
      {def.scope === "PLAYER_CLUB" && (
        <section className="control">
          <label className="control__label">Position filter</label>
          <div className="checks">
            {POSITION_GROUPS.map((g) => (
              <label key={g.value} className="check">
                <input
                  type="checkbox"
                  checked={def.positionFilter.groups.includes(g.value)}
                  onChange={() => toggleGroup(g.value)}
                />
                {g.label}
              </label>
            ))}
          </div>
          <div className="segmented segmented--sm">
            <button
              className={def.positionFilter.broad === null ? "seg seg--on" : "seg"}
              onClick={() => setBroad(null)}
            >
              Any
            </button>
            {BROAD_GROUPS.map((b) => (
              <button
                key={b.value}
                className={def.positionFilter.broad === b.value ? "seg seg--on" : "seg"}
                onClick={() => setBroad(b.value)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Percentile mode */}
      <section className="control">
        <label className="control__label">Values</label>
        <div className="segmented">
          {PERCENTILE_MODES.map((m) => (
            <button
              key={m.value}
              className={def.percentileMode === m.value ? "seg seg--on" : "seg"}
              onClick={() => patch({ percentileMode: m.value as PercentileMode })}
            >
              {m.label}
            </button>
          ))}
        </div>
      </section>

      {/* Benchmark overlay */}
      <section className="control">
        <label className="control__label">Benchmark overlay</label>
        <select
          value={def.benchmarkOverlay}
          onChange={(e) => patch({ benchmarkOverlay: e.target.value as BenchmarkOverlay })}
        >
          {BENCHMARK_OVERLAYS.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
      </section>

      {/* Axis flips */}
      <section className="control">
        <label className="control__label">Axis flips (put “better” high/right)</label>
        <div className="checks checks--row">
          <label className="check">
            <input
              type="checkbox"
              checked={def.axisFlips.x}
              onChange={(e) => patch({ axisFlips: { ...def.axisFlips, x: e.target.checked } })}
            />
            Flip X
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={def.axisFlips.y}
              onChange={(e) => patch({ axisFlips: { ...def.axisFlips, y: e.target.checked } })}
            />
            Flip Y
          </label>
        </div>
      </section>

      <button className="btn btn--primary" onClick={onSavePreset}>
        Save as preset…
      </button>
    </aside>
  );
}

function MetricPicker({
  label,
  value,
  metrics,
  optional,
  onChange,
}: {
  label: string;
  value: string | null;
  metrics: MetricDefinition[];
  optional?: boolean;
  onChange: (id: string | null) => void;
}) {
  return (
    <section className="control">
      <label className="control__label">{label}</label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      >
        {optional && <option value="">— none —</option>}
        {metrics.map((m) => {
          const disabled = !isMetricAvailable(m);
          return (
            <option
              key={m.id}
              value={m.id}
              disabled={disabled}
              title={disabled ? PAID_TOOLTIP : m.description}
            >
              {m.label} [{availabilityBadge(m.availability)}]
              {disabled ? " — unavailable" : ""}
            </option>
          );
        })}
      </select>
    </section>
  );
}
