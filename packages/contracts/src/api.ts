import { z } from "zod";
import { Competition, PositionCode, PositionGroup, Scope, Season } from "./entities.js";
import { MetricUnit } from "./metrics.js";
import { ChartDefinition, ChartType, PercentileMode, Preset } from "./chart.js";
import { FreshnessEntry } from "./records.js";

/**
 * API BOUNDARY CONTRACTS. Every endpoint's input and output is a schema here,
 * validated on the way in AND the way out. The frontend imports these types so
 * the wire format is compile-time enforced end to end.
 */

/* ---- listMetrics ---- */
export const ListMetricsInput = z
  .object({ scope: Scope.optional() })
  .default({});
export type ListMetricsInput = z.infer<typeof ListMetricsInput>;

/* ---- queryCohort ---- */
export const QueryCohortInput = z.object({
  scope: Scope,
  competition: Competition,
  season: Season,
  positionGroups: z.array(PositionGroup).default([]),
});
export type QueryCohortInput = z.infer<typeof QueryCohortInput>;

export const CohortSubject = z.object({
  subjectId: z.string(),
  label: z.string(),
  teamId: z.string(),
  position: PositionCode.nullable(),
  positionGroup: PositionGroup.nullable(),
  matchCount: z.number().int().nonnegative(),
});
export type CohortSubject = z.infer<typeof CohortSubject>;

export const QueryCohortResponse = z.object({
  scope: Scope,
  subjects: z.array(CohortSubject),
  freshness: z.array(FreshnessEntry),
});
export type QueryCohortResponse = z.infer<typeof QueryCohortResponse>;

/* ---- computeChart ---- */
export const ComputeChartInput = ChartDefinition;
export type ComputeChartInput = z.infer<typeof ComputeChartInput>;

export const AxisMeta = z.object({
  metricId: z.string(),
  label: z.string(),
  unit: MetricUnit,
  higherIsBetter: z.boolean(),
  /** Whether the frontend should invert this axis so "better" sits high/right. */
  flipped: z.boolean(),
  /** True when values are positional percentiles (0..100) rather than raw. */
  percentile: z.boolean(),
});
export type AxisMeta = z.infer<typeof AxisMeta>;

export const ChartPoint = z.object({
  subjectId: z.string(),
  label: z.string(),
  teamId: z.string(),
  positionGroup: PositionGroup.nullable(),
  x: z.number(),
  y: z.number().nullable(),
  size: z.number().nullable(),
});
export type ChartPoint = z.infer<typeof ChartPoint>;

/** A benchmark median rendered as a crosshair (x and/or y median line). */
export const BenchmarkResult = z.object({
  kind: z.string(),
  label: z.string(),
  x: z.number().nullable(),
  y: z.number().nullable(),
});
export type BenchmarkResult = z.infer<typeof BenchmarkResult>;

/** For radar / grouped-bar: one row per subject with values per category metric. */
export const CategorySeries = z.object({
  subjectId: z.string(),
  label: z.string(),
  values: z.record(z.string(), z.number()),
});
export type CategorySeries = z.infer<typeof CategorySeries>;

/** For stacked-bar: one row per subject with a value per stack segment. */
export const StackSeries = z.object({
  subjectId: z.string(),
  label: z.string(),
  segments: z.record(z.string(), z.number()),
});
export type StackSeries = z.infer<typeof StackSeries>;

export const ComputeChartResponse = z.object({
  chartType: ChartType,
  percentileMode: PercentileMode,
  xAxis: AxisMeta,
  yAxis: AxisMeta.nullable(),
  sizeAxis: AxisMeta.nullable(),
  points: z.array(ChartPoint),
  benchmark: BenchmarkResult.nullable(),
  /** Populated for radar/groupedBar chart types. */
  categorySeries: z.array(CategorySeries).default([]),
  categoryAxes: z.array(AxisMeta).default([]),
  /** Populated for stackedBar chart type. */
  stackSeries: z.array(StackSeries).default([]),
  stackAxes: z.array(AxisMeta).default([]),
  /**
   * Non-fatal notes (e.g. "3 subjects excluded: missing yMetric"). Missing data
   * is NEVER silently imputed; either the point is dropped with a warning here,
   * or — for a required unavailable metric — computeChart rejects outright.
   */
  warnings: z.array(z.string()),
  freshness: z.array(FreshnessEntry),
});
export type ComputeChartResponse = z.infer<typeof ComputeChartResponse>;

/* ---- presets ---- */
export const ListPresetsResponse = z.object({ presets: z.array(Preset) });
export type ListPresetsResponse = z.infer<typeof ListPresetsResponse>;

export const SavePresetInput = Preset;
export type SavePresetInput = z.infer<typeof SavePresetInput>;

export const LoadPresetInput = z.object({ id: z.string().min(1) });
export type LoadPresetInput = z.infer<typeof LoadPresetInput>;

/* ---- freshness ---- */
export const FreshnessResponse = z.object({ entries: z.array(FreshnessEntry) });
export type FreshnessResponse = z.infer<typeof FreshnessResponse>;
