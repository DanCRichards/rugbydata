import { z } from "zod";
import { PositionGroup, Scope } from "./entities.js";

/**
 * THE METRICS REGISTRY CONTRACT.
 *
 * A single MetricDefinition is the atom of the whole system. Ingestion writes
 * raw fields keyed by metric id; derivation reads `aggregation` and
 * `normalizationBasis` to decide how to roll up and normalise; the API exposes
 * `availability` so the frontend can disable pickers; the frontend renders
 * `label`/`unit`/`higherIsBetter`. Nothing downstream may invent a metric that
 * is not declared here.
 */

export const MetricUnit = z.enum([
  "count",
  "metres",
  "percent",
  "seconds",
  "points",
  "ratio",
  "index",
]);
export type MetricUnit = z.infer<typeof MetricUnit>;

/**
 * How per-match raw values roll up into a single cohort value for a subject.
 * - sum: totals across matches (rarely used directly; usually normalised)
 * - mean: average per match
 * - rate: sum(numerator)/sum(denominator) — see normalizationBasis
 * - weighted: composite weighted average of components (composite metrics only)
 * - median: median across the cohort (benchmark series)
 */
export const Aggregation = z.enum(["sum", "mean", "rate", "weighted", "median"]);
export type Aggregation = z.infer<typeof Aggregation>;

/**
 * The denominator a metric is normalised against. The spec is strict: team
 * metrics are NEVER raw totals — always per-ruck / per-100-rucks / per-visit,
 * and this basis is stored on the metric itself.
 */
export const NormalizationBasis = z.enum([
  "none", // already a rate/percent, or a pure count that is compared as-is
  "per80", // per 80 minutes played (player workload metrics)
  "perRuck", // divided by team rucks
  "per100Rucks", // divided by team rucks, x100
  "perVisit", // divided by visits to the opposition 22
  "perCarry", // divided by carries
]);
export type NormalizationBasis = z.infer<typeof NormalizationBasis>;

/**
 * Data availability. This is the gate the frontend reads.
 * - FREE: scrapeable now from a free source (rugbypy / RugbyPass / match centre)
 * - DERIVE: computed deterministically from free box-score fields
 * - PAID_UNAVAILABLE: requires a paid event feed (Opta/Sportradar); the metric
 *   is registered and slotted but produces no data until a paid adapter lands.
 */
export const Availability = z.enum(["FREE", "DERIVE", "PAID_UNAVAILABLE"]);
export type Availability = z.infer<typeof Availability>;

/** Where a metric's underlying data originates. Stored for provenance/audit. */
export const ProvenanceSource = z.enum([
  "rugbypy",
  "rugbypass",
  "matchCentre",
  "derived",
  "paidProvider",
]);
export type ProvenanceSource = z.infer<typeof ProvenanceSource>;

/**
 * A component reference for composite (weighted) metrics such as workRate or
 * setPieceWinPctOwnBall. Each references another registered metric id.
 */
export const MetricComponent = z.object({
  metricId: z.string().min(1),
  weight: z.number().positive(),
});
export type MetricComponent = z.infer<typeof MetricComponent>;

export const MetricDefinition = z.object({
  /** Stable machine id, camelCase, referenced by chart definitions. */
  id: z.string().min(1),
  /** Human label for axis pickers and chart axes. */
  label: z.string().min(1),
  /** One-line description for tooltips. */
  description: z.string().default(""),
  unit: MetricUnit,
  /** PLAYER metrics vs TEAM metrics — a chart never mixes scopes. */
  scope: Scope,
  /**
   * Which position groups this metric is meaningful for. Empty array = all
   * positions (e.g. team metrics, or universal player metrics like tackles).
   */
  applicablePositions: z.array(PositionGroup).default([]),
  aggregation: Aggregation,
  normalizationBasis: NormalizationBasis.default("none"),
  availability: Availability,
  provenance: ProvenanceSource,
  /**
   * Direction of "good". Used for axis flips so "better" sits high/right, and
   * for percentile interpretation. false => lower is better (penalties, etc.).
   */
  higherIsBetter: z.boolean().default(true),
  /**
   * For rate metrics: the id of the metric providing the denominator's raw
   * count when it is another registered field (e.g. per-carry uses carries).
   * Null when the basis denominator is a first-class stat on the record
   * (rucks, minutes, visits) resolved by the derivation layer.
   */
  rateDenominatorMetricId: z.string().nullable().default(null),
  /** Component metrics for composite/weighted definitions; empty otherwise. */
  components: z.array(MetricComponent).default([]),
});
export type MetricDefinition = z.infer<typeof MetricDefinition>;

/** The registry as served over the wire: a list plus availability rollup. */
export const MetricsCatalog = z.object({
  metrics: z.array(MetricDefinition),
});
export type MetricsCatalog = z.infer<typeof MetricsCatalog>;

export function isAvailable(m: Pick<MetricDefinition, "availability">): boolean {
  return m.availability !== "PAID_UNAVAILABLE";
}
