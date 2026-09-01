import type { MatchStatRecord, MetricDefinition } from "@ruckmetrics/contracts";

let seq = 0;

/** Build a minimal valid MatchStatRecord for tests. */
export function rec(
  subjectId: string,
  values: Record<string, number>,
  opts: Partial<Pick<MatchStatRecord, "matchId" | "entityKind" | "position">> = {},
): MatchStatRecord {
  seq += 1;
  const matchId = opts.matchId ?? `m${seq}`;
  const entityKind = opts.entityKind ?? "PLAYER";
  return {
    id: `${entityKind}:${subjectId}:${matchId}`,
    entityKind,
    subjectId,
    matchId,
    competition: "URC",
    season: "2024-25",
    position: opts.position ?? null,
    values,
    provenance: { source: "rugbypy", url: null, fetchedAt: "2025-01-01T00:00:00.000Z" },
  };
}

/** Build a MetricDefinition for tests with sensible defaults. */
export function metric(over: Partial<MetricDefinition> & Pick<MetricDefinition, "id">): MetricDefinition {
  return {
    id: over.id,
    label: over.label ?? over.id,
    description: over.description ?? "",
    unit: over.unit ?? "count",
    scope: over.scope ?? "PLAYER_CLUB",
    applicablePositions: over.applicablePositions ?? [],
    aggregation: over.aggregation ?? "mean",
    normalizationBasis: over.normalizationBasis ?? "none",
    availability: over.availability ?? "FREE",
    provenance: over.provenance ?? "rugbypy",
    higherIsBetter: over.higherIsBetter ?? true,
    rateDenominatorMetricId: over.rateDenominatorMetricId ?? null,
    components: over.components ?? [],
  };
}

/** A lookup that resolves from a fixed set of metrics; throws on unknown. */
export function lookupFrom(metrics: MetricDefinition[]) {
  const m = new Map(metrics.map((x) => [x.id, x]));
  return (id: string): MetricDefinition => {
    const found = m.get(id);
    if (!found) throw new Error(`test lookup: unknown metric ${id}`);
    return found;
  };
}
