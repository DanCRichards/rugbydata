import {
  DENOMINATOR_FIELDS,
  type MatchStatRecord,
  type MetricDefinition,
  type NormalizationBasis,
} from "@ruckmetrics/contracts";
import { DataIntegrityError } from "./errors.js";

/**
 * Pure, deterministic aggregation of one subject's match records into a single
 * raw cohort value for one metric. No I/O, no globals, no randomness.
 *
 * Returns `null` when the subject has no usable data for the metric (the caller
 * excludes it with a warning). Throws DataIntegrityError only on malformed data.
 */

/** Multiplier applied after dividing by the basis denominator. */
const BASIS_SCALE: Record<NormalizationBasis, number> = {
  none: 1,
  per80: 80,
  perRuck: 1,
  per100Rucks: 100,
  perVisit: 1,
  perCarry: 1,
};

/** Lookup used to resolve component metrics for composite (weighted) metrics. */
export type MetricLookup = (id: string) => MetricDefinition;

function valuesPresent(records: MatchStatRecord[], key: string): MatchStatRecord[] {
  return records.filter((r) => Number.isFinite(r.values[key]));
}

function sum(records: MatchStatRecord[], key: string): number {
  return records.reduce((acc, r) => acc + (r.values[key] ?? 0), 0);
}

function aggregateRate(records: MatchStatRecord[], metric: MetricDefinition): number | null {
  if (metric.normalizationBasis === "none") {
    // A "rate" with no basis is just a mean of the stored per-match values.
    return aggregateMean(records, metric);
  }
  const denomField = DENOMINATOR_FIELDS[metric.normalizationBasis];
  const contributing = valuesPresent(records, metric.id);
  if (contributing.length === 0) return null;

  // Every contributing record MUST carry its denominator — else the data is
  // malformed and we fail loud rather than guess.
  for (const r of contributing) {
    if (!Number.isFinite(r.values[denomField])) {
      throw new DataIntegrityError(
        `Metric ${metric.id} needs denominator '${denomField}' but record ${r.id} is missing it`,
      );
    }
  }
  const numerator = sum(contributing, metric.id);
  const denominator = sum(contributing, denomField);
  if (denominator === 0) return null; // cannot divide; excluded transparently
  return (numerator / denominator) * BASIS_SCALE[metric.normalizationBasis];
}

function aggregateMean(records: MatchStatRecord[], metric: MetricDefinition): number | null {
  const contributing = valuesPresent(records, metric.id);
  if (contributing.length === 0) return null;
  return sum(contributing, metric.id) / contributing.length;
}

function aggregateSum(records: MatchStatRecord[], metric: MetricDefinition): number | null {
  const contributing = valuesPresent(records, metric.id);
  if (contributing.length === 0) return null;
  return sum(contributing, metric.id);
}

function aggregateWeighted(
  records: MatchStatRecord[],
  metric: MetricDefinition,
  lookup: MetricLookup,
): number | null {
  if (metric.components.length === 0) {
    throw new DataIntegrityError(`Weighted metric ${metric.id} has no components`);
  }
  let weightedSum = 0;
  let weightTotal = 0;
  for (const c of metric.components) {
    const componentMetric = lookup(c.metricId);
    const v = aggregateSubjectMetric(records, componentMetric, lookup);
    if (v === null) continue; // component missing → excluded from the average
    weightedSum += v * c.weight;
    weightTotal += c.weight;
  }
  if (weightTotal === 0) return null; // no component had data
  return weightedSum / weightTotal;
}

/**
 * Aggregate a subject's records into a single raw value for the given metric.
 */
export function aggregateSubjectMetric(
  records: MatchStatRecord[],
  metric: MetricDefinition,
  lookup: MetricLookup,
): number | null {
  switch (metric.aggregation) {
    case "rate":
      return aggregateRate(records, metric);
    case "mean":
      return aggregateMean(records, metric);
    case "sum":
      return aggregateSum(records, metric);
    case "weighted":
      return aggregateWeighted(records, metric, lookup);
    case "median":
      // A median-aggregation metric is a benchmark series; a single subject has
      // no median of its own. Treated as a mean at the subject level.
      return aggregateMean(records, metric);
    default: {
      const _exhaustive: never = metric.aggregation;
      throw new DataIntegrityError(`Unhandled aggregation: ${String(_exhaustive)}`);
    }
  }
}
