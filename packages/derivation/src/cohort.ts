import type { MetricDefinition, PositionGroup } from "@ruckmetrics/contracts";
import type { MatchStatRecord } from "@ruckmetrics/contracts";
import { aggregateSubjectMetric, type MetricLookup } from "./aggregate.js";
import { median, percentileRanks } from "./stats.js";

/**
 * Cohort-level derivation. Given a set of subjects (each with their match
 * records), produce the per-subject values that the chart engine plots — raw,
 * or transformed into positional percentiles, plus benchmark medians.
 *
 * These functions are pure and deterministic: same inputs → identical outputs.
 */

export interface SubjectRecords {
  subjectId: string;
  /** null for team subjects; drives positional-percentile grouping for players. */
  positionGroup: PositionGroup | null;
  records: MatchStatRecord[];
}

/** Per-subject raw aggregated value for a metric. Subjects with no data omitted. */
export function cohortRawValues(
  subjects: SubjectRecords[],
  metric: MetricDefinition,
  lookup: MetricLookup,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of subjects) {
    const v = aggregateSubjectMetric(s.records, metric, lookup);
    if (v !== null) out.set(s.subjectId, v);
  }
  return out;
}

/**
 * Positional-percentile values (0..100) for a metric. Percentiles are computed
 * WITHIN each position group so peers are ranked against peers. Subjects with a
 * null position group (teams) are ranked as one cohort. Direction is honoured:
 * for "lower is better" metrics the ranks are inverted so 100 = best.
 */
export function positionalPercentileValues(
  subjects: SubjectRecords[],
  metric: MetricDefinition,
  lookup: MetricLookup,
): Map<string, number> {
  const raw = cohortRawValues(subjects, metric, lookup);
  const groupOf = new Map<string, PositionGroup | "__all__">();
  for (const s of subjects) {
    groupOf.set(s.subjectId, s.positionGroup ?? "__all__");
  }

  // Partition raw values by position group.
  const byGroup = new Map<PositionGroup | "__all__", Map<string, number>>();
  for (const [subjectId, value] of raw) {
    const g = groupOf.get(subjectId) ?? "__all__";
    let bucket = byGroup.get(g);
    if (!bucket) {
      bucket = new Map();
      byGroup.set(g, bucket);
    }
    bucket.set(subjectId, value);
  }

  const out = new Map<string, number>();
  for (const bucket of byGroup.values()) {
    const ranks = percentileRanks(bucket, metric.higherIsBetter);
    for (const [id, r] of ranks) out.set(id, r);
  }
  return out;
}

/**
 * Benchmark median of a metric across the given (benchmark) subjects. Returns
 * null when no benchmark subject has data.
 */
export function benchmarkMedianValue(
  subjects: SubjectRecords[],
  metric: MetricDefinition,
  lookup: MetricLookup,
): number | null {
  const raw = [...cohortRawValues(subjects, metric, lookup).values()];
  if (raw.length === 0) return null;
  return median(raw);
}
