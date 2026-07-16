import type { ComputeChartResponse } from "@ruckmetrics/contracts";
import { colorFor, formatValue } from "../domain";
import { formatTick, linearScale, ticks } from "../scale";

interface Props {
  response: ComputeChartResponse;
}

const W = 720;
const H = 460;
const M = { top: 24, right: 24, bottom: 90, left: 64 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;

/**
 * Grouped bars over categoryAxes (fallback view for the radar category data)
 * and stacked bars over stackSeries segments. The engine picks which via
 * response.chartType; both share this component.
 */
export function BarChart({ response }: Props) {
  return response.chartType === "stackedBar" ? (
    <StackedBars response={response} />
  ) : (
    <GroupedBars response={response} />
  );
}

function GroupedBars({ response }: Props) {
  const axes = response.categoryAxes;
  const series = response.categorySeries;
  const seriesKeys = series.map((s) => s.subjectId);

  let max = 0;
  for (const s of series) {
    for (const ax of axes) {
      const v = s.values[ax.metricId];
      if (typeof v === "number") max = Math.max(max, v);
    }
  }
  if (max === 0) max = 1;
  const y = linearScale(0, max, M.top + PLOT_H, M.top);

  const groupW = PLOT_W / Math.max(1, axes.length);
  const barW = (groupW * 0.7) / Math.max(1, series.length);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart__svg" role="img" aria-label="Grouped bar chart">
        {ticks(0, max, 5).map((t, i) => (
          <g key={i}>
            <line x1={M.left} x2={M.left + PLOT_W} y1={y(t)} y2={y(t)} className="grid" />
            <text x={M.left - 10} y={y(t) + 4} className="tick" textAnchor="end">
              {formatTick(t)}
            </text>
          </g>
        ))}
        {axes.map((ax, gi) => {
          const gx = M.left + gi * groupW + groupW * 0.15;
          return (
            <g key={ax.metricId}>
              {series.map((s, si) => {
                const v = s.values[ax.metricId];
                if (typeof v !== "number") return null;
                const bx = gx + si * barW;
                const by = y(v);
                return (
                  <rect
                    key={s.subjectId}
                    x={bx}
                    y={by}
                    width={barW * 0.9}
                    height={M.top + PLOT_H - by}
                    fill={colorFor(s.subjectId, seriesKeys)}
                  >
                    <title>{`${s.label} · ${ax.label}: ${formatValue(v, ax.unit, ax.percentile)}`}</title>
                  </rect>
                );
              })}
              <text
                x={gx + (groupW * 0.7) / 2}
                y={M.top + PLOT_H + 16}
                className="tick"
                textAnchor="end"
                transform={`rotate(-35 ${gx + (groupW * 0.7) / 2} ${M.top + PLOT_H + 16})`}
              >
                {ax.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {series.map((s) => (
          <span key={s.subjectId} className="legend__item">
            <span className="legend__swatch" style={{ background: colorFor(s.subjectId, seriesKeys) }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function StackedBars({ response }: Props) {
  const axes = response.stackAxes;
  const series = response.stackSeries;
  const segKeys = axes.map((a) => a.metricId);

  const totals = series.map((s) =>
    axes.reduce((acc, ax) => acc + (s.segments[ax.metricId] ?? 0), 0),
  );
  let max = Math.max(0, ...totals);
  if (max === 0) max = 1;
  const y = linearScale(0, max, M.top + PLOT_H, M.top);

  const bandW = PLOT_W / Math.max(1, series.length);
  const barW = bandW * 0.6;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart__svg" role="img" aria-label="Stacked bar chart">
        {ticks(0, max, 5).map((t, i) => (
          <g key={i}>
            <line x1={M.left} x2={M.left + PLOT_W} y1={y(t)} y2={y(t)} className="grid" />
            <text x={M.left - 10} y={y(t) + 4} className="tick" textAnchor="end">
              {formatTick(t)}
            </text>
          </g>
        ))}
        {series.map((s, bi) => {
          const bx = M.left + bi * bandW + (bandW - barW) / 2;
          let cursor = 0;
          return (
            <g key={s.subjectId}>
              {axes.map((ax) => {
                const v = s.segments[ax.metricId] ?? 0;
                const y0 = y(cursor);
                const y1 = y(cursor + v);
                cursor += v;
                return (
                  <rect
                    key={ax.metricId}
                    x={bx}
                    y={y1}
                    width={barW}
                    height={y0 - y1}
                    fill={colorFor(ax.metricId, segKeys)}
                  >
                    <title>{`${s.label} · ${ax.label}: ${formatValue(v, ax.unit, ax.percentile)}`}</title>
                  </rect>
                );
              })}
              <text
                x={bx + barW / 2}
                y={M.top + PLOT_H + 16}
                className="tick"
                textAnchor="end"
                transform={`rotate(-35 ${bx + barW / 2} ${M.top + PLOT_H + 16})`}
              >
                {s.label}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="legend">
        {axes.map((ax) => (
          <span key={ax.metricId} className="legend__item">
            <span className="legend__swatch" style={{ background: colorFor(ax.metricId, segKeys) }} />
            {ax.label}
          </span>
        ))}
      </div>
    </div>
  );
}
