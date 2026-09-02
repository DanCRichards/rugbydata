import { useState } from "react";
import type { ChartPoint, ComputeChartResponse, Scope } from "@ruckmetrics/contracts";
import { colorFor, formatValue, teamColourFor } from "../domain";
import { formatTick, linearScale, niceDomain, ticks } from "../scale";

interface Props {
  response: ComputeChartResponse;
  scope: Scope;
}

const W = 720;
const H = 260;
const M = { top: 40, right: 24, bottom: 56, left: 24 };
const PLOT_W = W - M.left - M.right;
const AXIS_Y = H - M.bottom;

/**
 * 1-D ranked strip / beeswarm along the X axis. Points are placed at their x
 * value with a small deterministic vertical jitter so overlapping values remain
 * visible. Used by "Blitz or Drift" (a PAID preset that renders empty).
 */
export function StripChart({ response, scope }: Props) {
  const [hover, setHover] = useState<{ p: ChartPoint; x: number; y: number } | null>(null);
  const { xAxis, points } = response;

  const xVals = points.map((p) => p.x);
  const [xMin, xMax] = niceDomain(xVals);
  const xScale = xAxis.flipped
    ? linearScale(xMin, xMax, M.left + PLOT_W, M.left)
    : linearScale(xMin, xMax, M.left, M.left + PLOT_W);

  const keys = Array.from(
    new Set(points.map((p) => (scope === "PLAYER_CLUB" ? p.positionGroup ?? "unknown" : p.teamId))),
  ).sort();
  const xTicks = ticks(xMin, xMax, 6);

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart__svg" role="img" aria-label="Ranked strip">
        <line x1={M.left} x2={M.left + PLOT_W} y1={AXIS_Y} y2={AXIS_Y} className="axis-line" />
        {xTicks.map((t, i) => (
          <g key={i}>
            <line x1={xScale(t)} x2={xScale(t)} y1={AXIS_Y} y2={AXIS_Y + 6} className="axis-line" />
            <text x={xScale(t)} y={AXIS_Y + 20} className="tick" textAnchor="middle">
              {formatTick(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) => {
          const cx = xScale(p.x);
          // deterministic jitter around the axis
          const cy = AXIS_Y - 12 - (i % 6) * 14;
          const key = scope === "PLAYER_CLUB" ? p.positionGroup ?? "unknown" : p.teamId;
          const fill = scope === "TEAM_TEST" ? teamColourFor(p.colours) : colorFor(key, keys);
          return (
            <circle
              key={p.subjectId}
              cx={cx}
              cy={cy}
              r={6}
              fill={fill}
              className="dot"
              onMouseEnter={() => setHover({ p, x: cx, y: cy })}
              onMouseLeave={() => setHover(null)}
            >
              <title>{p.label}</title>
            </circle>
          );
        })}
        <text x={M.left + PLOT_W / 2} y={H - 12} className="axis-title" textAnchor="middle">
          {xAxis.label}
          {xAxis.unit !== "count" ? ` (${xAxis.unit})` : ""}
          {xAxis.flipped ? " ↔ inverted" : ""}
        </text>
      </svg>
      {hover && (
        <div
          className="tooltip"
          style={{ left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%` }}
        >
          <strong>{hover.p.label}</strong>
          <div>
            {xAxis.label}: {formatValue(hover.p.x, xAxis.unit, xAxis.percentile)}
          </div>
        </div>
      )}
    </div>
  );
}
