import { z } from "zod";
import { BroadPositionGroup, Competition, PositionGroup, Scope, Season } from "./entities.js";

/**
 * THE CHART DEFINITION — the single schema that drives the entire frontend
 * engine. Every one of the 22 named analyses is just an instance of this.
 * There are no bespoke chart pages; there is one engine reading this object.
 */

export const PercentileMode = z.enum(["raw", "positional"]);
export type PercentileMode = z.infer<typeof PercentileMode>;

/** Benchmark median series overlaid on the chart. */
export const BenchmarkOverlay = z.enum([
  "none",
  "twelveSquadMedian", // median of 12 club squads
  "testMedian", // 2023–26 test median
]);
export type BenchmarkOverlay = z.infer<typeof BenchmarkOverlay>;

/**
 * Chart type. The engine is scatter-first, but the spec has two non-scatter
 * presets (radar/grouped-bar for the Final Summary, stacked-bar for the
 * forced/unforced turnover split), so the type is part of the definition.
 */
export const ChartType = z.enum(["scatter", "radar", "groupedBar", "stackedBar", "strip"]);
export type ChartType = z.infer<typeof ChartType>;

export const AxisFlips = z.object({
  x: z.boolean().default(false),
  y: z.boolean().default(false),
});
export type AxisFlips = z.infer<typeof AxisFlips>;

/**
 * Position filter for player cohorts. May target fine groups (e.g. flyHalf) or
 * a broad group (forwards/backs). Empty/absent = no position filter.
 */
export const PositionFilter = z.object({
  groups: z.array(PositionGroup).default([]),
  broad: BroadPositionGroup.nullable().default(null),
});
export type PositionFilter = z.infer<typeof PositionFilter>;

export const ChartDefinition = z.object({
  scope: Scope,
  chartType: ChartType.default("scatter"),
  /** X-axis metric id (required for scatter; for radar this is a category set — see categoryMetrics). */
  xMetric: z.string().min(1),
  /** Y-axis metric id. For scatter/most charts. */
  yMetric: z.string().min(1).nullable().default(null),
  /** Optional third metric mapped to marker size. */
  sizeMetric: z.string().min(1).nullable().default(null),
  positionFilter: PositionFilter.default({ groups: [], broad: null }),
  competition: Competition,
  season: Season,
  percentileMode: PercentileMode.default("raw"),
  benchmarkOverlay: BenchmarkOverlay.default("none"),
  axisFlips: AxisFlips.default({ x: false, y: false }),
  /**
   * For radar/grouped-bar summaries: the set of metric ids forming the category
   * axis (the "9 stat categories"). Ignored by scatter.
   */
  categoryMetrics: z.array(z.string()).default([]),
  /**
   * For stacked-bar splits (e.g. forced vs unforced turnovers): the metric ids
   * of each stacked segment. Ignored by scatter.
   */
  stackMetrics: z.array(z.string()).default([]),
});
export type ChartDefinition = z.infer<typeof ChartDefinition>;

/** A saved/named preset: a ChartDefinition plus identity + spec provenance. */
export const Preset = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  /** Part of the spec this came from, e.g. "P1#1" or "P2#11". */
  specRef: z.string().default(""),
  definition: ChartDefinition,
});
export type Preset = z.infer<typeof Preset>;
