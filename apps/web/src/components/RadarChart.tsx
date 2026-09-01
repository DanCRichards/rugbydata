import type { AxisMeta, CategorySeries, ComputeChartResponse } from "@ruckmetrics/contracts";
import { colorFor } from "../domain";

interface Props {
  response: ComputeChartResponse;
}

const SIZE = 560;
const CX = SIZE / 2;
const CY = SIZE / 2 + 6;
const R = 190;
const BENCHMARK_ID = "__benchmark__";

/**
 * Radar / spider chart over categoryAxes. One polygon per categorySeries row;
 * the "__benchmark__" row (if present) is drawn distinctly (dashed).
 */
export function RadarChart({ response }: Props) {
  const axes = response.categoryAxes;
  const series = response.categorySeries;

  if (axes.length < 3) {
    return <p className="muted">Radar needs at least 3 category axes.</p>;
  }

  // Per-axis min/max across every series (so each spoke is independently scaled).
  const bounds = new Map<string, { min: number; max: number }>();
  for (const ax of axes) {
    let min = Infinity;
    let max = -Infinity;
    for (const s of series) {
      const v = s.values[ax.metricId];
      if (typeof v === "number") {
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
    }
    if (!Number.isFinite(min)) {
      min = 0;
      max = 1;
    }
    if (min === max) max = min + 1;
    bounds.set(ax.metricId, { min, max });
  }

  const angleFor = (i: number): number => (Math.PI * 2 * i) / axes.length - Math.PI / 2;

  const pointFor = (ax: AxisMeta, i: number, value: number): [number, number] => {
    const b = bounds.get(ax.metricId)!;
    const frac = (value - b.min) / (b.max - b.min || 1);
    const rr = Math.max(0, Math.min(1, frac)) * R;
    const a = angleFor(i);
    return [CX + Math.cos(a) * rr, CY + Math.sin(a) * rr];
  };

  const polygonFor = (s: CategorySeries): string =>
    axes
      .map((ax, i) => {
        const v = s.values[ax.metricId];
        if (typeof v !== "number") return null;
        const [x, y] = pointFor(ax, i, v);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .filter((p): p is string => p !== null)
      .join(" ");

  const keys = series.map((s) => s.subjectId);
  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="chart__svg" role="img" aria-label="Radar chart">
        {/* rings */}
        {rings.map((frac, i) => (
          <polygon
            key={`ring${i}`}
            className="grid"
            fill="none"
            points={axes
              .map((_, j) => {
                const a = angleFor(j);
                return `${(CX + Math.cos(a) * R * frac).toFixed(1)},${(CY + Math.sin(a) * R * frac).toFixed(1)}`;
              })
              .join(" ")}
          />
        ))}
        {/* spokes + labels */}
        {axes.map((ax, i) => {
          const a = angleFor(i);
          const ex = CX + Math.cos(a) * R;
          const ey = CY + Math.sin(a) * R;
          const lx = CX + Math.cos(a) * (R + 24);
          const ly = CY + Math.sin(a) * (R + 24);
          return (
            <g key={ax.metricId}>
              <line x1={CX} y1={CY} x2={ex} y2={ey} className="grid" />
              <text
                x={lx}
                y={ly}
                className="tick"
                textAnchor={Math.abs(Math.cos(a)) < 0.3 ? "middle" : lx < CX ? "end" : "start"}
              >
                {ax.label}
              </text>
            </g>
          );
        })}
        {/* series polygons */}
        {series.map((s) => {
          const isBench = s.subjectId === BENCHMARK_ID;
          const color = isBench ? "#111827" : colorFor(s.subjectId, keys);
          return (
            <polygon
              key={s.subjectId}
              points={polygonFor(s)}
              fill={isBench ? "none" : color}
              fillOpacity={isBench ? 0 : 0.12}
              stroke={color}
              strokeWidth={isBench ? 2 : 1.5}
              strokeDasharray={isBench ? "6 4" : undefined}
            />
          );
        })}
      </svg>
      <div className="legend">
        {series.map((s) => {
          const isBench = s.subjectId === BENCHMARK_ID;
          return (
            <span key={s.subjectId} className="legend__item">
              <span
                className="legend__swatch"
                style={{
                  background: isBench ? "transparent" : colorFor(s.subjectId, keys),
                  border: isBench ? "2px dashed #111827" : undefined,
                }}
              />
              {s.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
