import { useState } from "react";
import type { ChartPoint, ComputeChartResponse, Scope } from "@ruckmetrics/contracts";
import { colorFor, formatValue, positionGroupLabel, teamColourFor } from "../domain";
import { formatTick, linearScale, niceDomain, ticks } from "../scale";

interface Props {
  response: ComputeChartResponse;
  scope: Scope;
}

const W = 720;
const H = 520;
const M = { top: 24, right: 24, bottom: 56, left: 64 };
const PLOT_W = W - M.left - M.right;
const PLOT_H = H - M.top - M.bottom;
const R_MIN = 4;
const R_MAX = 16;

interface Hover {
  point: ChartPoint;
  cx: number;
  cy: number;
}

/** Colour key for a point: position group (player scope) or team (team scope). */
function keyOf(p: ChartPoint, scope: Scope): string {
  if (scope === "PLAYER_CLUB") return p.positionGroup ?? "unknown";
  return p.teamId;
}

export function ScatterChart({ response, scope }: Props) {
  const [hover, setHover] = useState<Hover | null>(null);

  const { xAxis, yAxis, sizeAxis, points, benchmark } = response;
  const usable = points.filter((p) => p.y !== null);

  const xVals = usable.map((p) => p.x);
  const yVals = usable.map((p) => p.y as number);
  const [xMin, xMax] = niceDomain(xVals);
  const [yMin, yMax] = niceDomain(yVals);

  // Honour axisMeta.flipped by inverting the pixel range.
  const xScale = xAxis.flipped
    ? linearScale(xMin, xMax, M.left + PLOT_W, M.left)
    : linearScale(xMin, xMax, M.left, M.left + PLOT_W);
  const yScale = yAxis && yAxis.flipped
    ? linearScale(yMin, yMax, M.top, M.top + PLOT_H)
    : linearScale(yMin, yMax, M.top + PLOT_H, M.top);

  const sizeVals = usable.map((p) => p.size).filter((s): s is number => s !== null);
  const hasSize = sizeAxis !== null && sizeVals.length > 0;
  const [sMin, sMax] = hasSize ? niceDomain(sizeVals, 0) : [0, 1];
  const rScale = linearScale(sMin, sMax, R_MIN, R_MAX);
  const radiusOf = (p: ChartPoint): number =>
    hasSize && p.size !== null ? rScale(p.size) : 6;

  const keys = Array.from(new Set(usable.map((p) => keyOf(p, scope)))).sort();

  // Colour per legend key: team scope uses each team's kit colours; player
  // scope keeps the position-group palette.
  const colourOf = (key: string): string =>
    scope === "TEAM_TEST"
      ? teamColourFor(usable.find((p) => p.teamId === key)?.colours)
      : colorFor(key, keys);

  const xTicks = ticks(xMin, xMax, 6);
  const yTicks = ticks(yMin, yMax, 6);

  const xLabel = `${xAxis.label}${xAxis.percentile ? " (percentile)" : xAxis.unit !== "count" ? ` (${xAxis.unit})` : ""}`;
  const yLabel = yAxis
    ? `${yAxis.label}${yAxis.percentile ? " (percentile)" : yAxis.unit !== "count" ? ` (${yAxis.unit})` : ""}`
    : "";

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart__svg" role="img" aria-label="Scatter plot">
        {/* gridlines + axes */}
        {xTicks.map((t, i) => (
          <g key={`x${i}`}>
            <line x1={xScale(t)} x2={xScale(t)} y1={M.top} y2={M.top + PLOT_H} className="grid" />
            <text x={xScale(t)} y={M.top + PLOT_H + 18} className="tick" textAnchor="middle">
              {formatTick(t)}
            </text>
          </g>
        ))}
        {yTicks.map((t, i) => (
          <g key={`y${i}`}>
            <line x1={M.left} x2={M.left + PLOT_W} y1={yScale(t)} y2={yScale(t)} className="grid" />
            <text x={M.left - 10} y={yScale(t) + 4} className="tick" textAnchor="end">
              {formatTick(t)}
            </text>
          </g>
        ))}

        {/* benchmark crosshair */}
        {benchmark && benchmark.x !== null && (
          <line
            x1={xScale(benchmark.x)}
            x2={xScale(benchmark.x)}
            y1={M.top}
            y2={M.top + PLOT_H}
            className="benchmark"
          />
        )}
        {benchmark && benchmark.y !== null && (
          <line
            x1={M.left}
            x2={M.left + PLOT_W}
            y1={yScale(benchmark.y)}
            y2={yScale(benchmark.y)}
            className="benchmark"
          />
        )}
        {benchmark && (benchmark.x !== null || benchmark.y !== null) && (
          <text
            x={M.left + PLOT_W - 4}
            y={M.top + 14}
            className="benchmark__label"
            textAnchor="end"
          >
            {benchmark.label}
          </text>
        )}

        {/* points */}
        {usable.map((p) => {
          const cx = xScale(p.x);
          const cy = yScale(p.y as number);
          return (
            <circle
              key={p.subjectId}
              cx={cx}
              cy={cy}
              r={radiusOf(p)}
              fill={colourOf(keyOf(p, scope))}
              className="dot"
              onMouseEnter={() => setHover({ point: p, cx, cy })}
              onMouseLeave={() => setHover(null)}
            >
              <title>{p.label}</title>
            </circle>
          );
        })}

        {/* axis titles */}
        <text x={M.left + PLOT_W / 2} y={H - 12} className="axis-title" textAnchor="middle">
          {xLabel}
          {xAxis.flipped ? " ↔ inverted" : ""}
        </text>
        {yAxis && (
          <text
            transform={`translate(16 ${M.top + PLOT_H / 2}) rotate(-90)`}
            className="axis-title"
            textAnchor="middle"
          >
            {yLabel}
            {yAxis.flipped ? " ↔ inverted" : ""}
          </text>
        )}
      </svg>

      {hover && (
        <div
          className="tooltip"
          style={{
            left: `${(hover.cx / W) * 100}%`,
            top: `${(hover.cy / H) * 100}%`,
          }}
        >
          <strong>{hover.point.label}</strong>
          <div>
            {xAxis.label}: {formatValue(hover.point.x, xAxis.unit, xAxis.percentile)}
          </div>
          {yAxis && (
            <div>
              {yAxis.label}: {formatValue(hover.point.y, yAxis.unit, yAxis.percentile)}
            </div>
          )}
          {sizeAxis && hover.point.size !== null && (
            <div>
              {sizeAxis.label}: {formatValue(hover.point.size, sizeAxis.unit, sizeAxis.percentile)}
            </div>
          )}
          {scope === "PLAYER_CLUB" && (
            <div className="muted">{positionGroupLabel(hover.point.positionGroup)}</div>
          )}
        </div>
      )}

      <Legend keys={keys} colourOf={colourOf} scope={scope} sizeLabel={hasSize ? sizeAxis?.label ?? null : null} />
    </div>
  );
}

function Legend({
  keys,
  colourOf,
  scope,
  sizeLabel,
}: {
  keys: string[];
  colourOf: (key: string) => string;
  scope: Scope;
  sizeLabel: string | null;
}) {
  return (
    <div className="legend">
      {keys.map((k) => (
        <span key={k} className="legend__item">
          <span className="legend__swatch" style={{ background: colourOf(k) }} />
          {scope === "PLAYER_CLUB" ? positionGroupLabel(k === "unknown" ? null : (k as never)) : k}
        </span>
      ))}
      {sizeLabel && <span className="legend__item muted">● size = {sizeLabel}</span>}
    </div>
  );
}
