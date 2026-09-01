import { DataIntegrityError } from "./errors.js";

/**
 * Pure statistical primitives. Deterministic and dependency-free.
 */

/** Median of a non-empty numeric array. Throws on empty (fail loud). */
export function median(values: number[]): number {
  if (values.length === 0) {
    throw new DataIntegrityError("median() called with no values");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Percentile rank (0..100) of each subject's value within the cohort, using the
 * "fraction of cohort at or below" definition with midpoint handling of ties, so
 * the ranks are stable and symmetric. When `higherIsBetter` is false the ranks
 * are inverted so 100 always means "best".
 *
 * A single-element cohort maps to 50 (no spread to rank against).
 */
export function percentileRanks(
  values: Map<string, number>,
  higherIsBetter: boolean,
): Map<string, number> {
  const entries = [...values.entries()];
  const n = entries.length;
  const out = new Map<string, number>();
  if (n === 0) return out;
  if (n === 1) {
    out.set(entries[0]![0], 50);
    return out;
  }
  const nums = entries.map((e) => e[1]);
  for (const [id, v] of entries) {
    let below = 0;
    let equal = 0;
    for (const other of nums) {
      if (other < v) below += 1;
      else if (other === v) equal += 1;
    }
    // midpoint of the tie block → fair rank for equal values
    const rank = ((below + equal / 2) / n) * 100;
    out.set(id, higherIsBetter ? rank : 100 - rank);
  }
  return out;
}
