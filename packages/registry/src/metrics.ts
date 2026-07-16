import {
  MetricDefinition,
  MetricsCatalog,
  type Aggregation,
  type Availability,
  type MetricUnit,
  type NormalizationBasis,
  type PositionGroup,
  type ProvenanceSource,
  type Scope,
} from "@ruckmetrics/contracts";

/**
 * THE SINGLE METRICS REGISTRY.
 *
 * Every metric the system knows about is declared here exactly once. Ingestion,
 * derivation, the API and the frontend all read from this list. Adding a metric
 * is adding one entry; nothing else needs a schema change.
 *
 * Id convention: `p_` = player-scope metric, `t_` = team-scope metric. This
 * keeps ids globally unique and makes scope validation trivial.
 *
 * For rate metrics (normalizationBasis != "none") the per-match value stored in
 * a record under the metric id is the NUMERATOR; the denominator is resolved by
 * the derivation layer from the basis (minutesPlayed / teamRucks / visitsTo22 /
 * carries). For "none" metrics the stored value is the value itself.
 */

interface DefArgs {
  id: string;
  label: string;
  description?: string;
  unit: MetricUnit;
  scope: Scope;
  applicablePositions?: PositionGroup[];
  aggregation: Aggregation;
  normalizationBasis?: NormalizationBasis;
  availability: Availability;
  provenance: ProvenanceSource;
  higherIsBetter?: boolean;
  components?: { metricId: string; weight: number }[];
}

function def(a: DefArgs): MetricDefinition {
  return MetricDefinition.parse({
    id: a.id,
    label: a.label,
    description: a.description ?? "",
    unit: a.unit,
    scope: a.scope,
    applicablePositions: a.applicablePositions ?? [],
    aggregation: a.aggregation,
    normalizationBasis: a.normalizationBasis ?? "none",
    availability: a.availability,
    provenance: a.provenance,
    higherIsBetter: a.higherIsBetter ?? true,
    rateDenominatorMetricId: null,
    components: a.components ?? [],
  });
}

const FORWARD_GROUPS: PositionGroup[] = ["frontRow", "locks", "looseForwards"];
const LOOSE_AND_LOCKS: PositionGroup[] = ["locks", "looseForwards"];

/* ============================ PLAYER METRICS ============================ */

const PLAYER_METRICS: MetricDefinition[] = [
  def({
    id: "p_defendersBeaten",
    label: "Defenders Beaten",
    description: "Defenders beaten per match with ball in hand.",
    unit: "count",
    scope: "PLAYER_CLUB",
    aggregation: "mean",
    availability: "FREE",
    provenance: "rugbypy",
  }),
  def({
    id: "p_postContactMetres",
    label: "Post-Contact Metres",
    description: "Metres gained after first contact — a RugbyPass deep metric.",
    unit: "metres",
    scope: "PLAYER_CLUB",
    aggregation: "mean",
    availability: "FREE",
    provenance: "rugbypass",
  }),
  def({
    id: "p_turnoversWon",
    label: "Turnovers Won",
    description: "Turnovers won (jackals, steals, forced) per match.",
    unit: "count",
    scope: "PLAYER_CLUB",
    aggregation: "mean",
    availability: "FREE",
    provenance: "rugbypy",
  }),
  def({
    id: "p_ruckArrivalEffect",
    label: "Ruck Arrival Effectiveness",
    description: "Effectiveness of ruck arrivals (RugbyPass deep metric), 0–100.",
    unit: "percent",
    scope: "PLAYER_CLUB",
    applicablePositions: LOOSE_AND_LOCKS,
    aggregation: "mean",
    availability: "FREE",
    provenance: "rugbypass",
  }),
  def({
    id: "p_tacklesPer80",
    label: "Tackles per 80",
    description: "Tackles made normalised to 80 minutes played.",
    unit: "count",
    scope: "PLAYER_CLUB",
    aggregation: "rate",
    normalizationBasis: "per80",
    availability: "FREE",
    provenance: "rugbypy",
  }),
  def({
    id: "p_dominantTacklePct",
    label: "Dominant Tackle %",
    description: "Share of tackles that were dominant (RugbyPass deep metric).",
    unit: "percent",
    scope: "PLAYER_CLUB",
    aggregation: "mean",
    availability: "FREE",
    provenance: "rugbypass",
  }),
  def({
    id: "p_penaltiesConceded",
    label: "Penalties Conceded",
    description: "Penalties conceded per match. Lower is better.",
    unit: "count",
    scope: "PLAYER_CLUB",
    aggregation: "mean",
    availability: "FREE",
    provenance: "rugbypy",
    higherIsBetter: false,
  }),
  def({
    id: "p_ruckInvolvements",
    label: "Ruck Involvements",
    description: "Attacking + defensive ruck involvements per match.",
    unit: "count",
    scope: "PLAYER_CLUB",
    aggregation: "mean",
    availability: "FREE",
    provenance: "rugbypass",
  }),
  def({
    id: "p_tackleInvolvements",
    label: "Tackle Involvements",
    description: "Tackle involvements (made + assisted) per match.",
    unit: "count",
    scope: "PLAYER_CLUB",
    aggregation: "mean",
    availability: "FREE",
    provenance: "rugbypy",
  }),
  def({
    id: "p_workRate",
    label: "Work Rate",
    description:
      "Composite: (ruck + tackle involvements) per 80 minutes. The per-match numerator is assembled at ETL derive-time from the two involvement fields; the rate path then normalises it per 80.",
    unit: "index",
    scope: "PLAYER_CLUB",
    aggregation: "rate",
    normalizationBasis: "per80",
    availability: "DERIVE",
    provenance: "derived",
    components: [
      { metricId: "p_ruckInvolvements", weight: 1 },
      { metricId: "p_tackleInvolvements", weight: 1 },
    ],
  }),
  def({
    id: "p_tryAssists",
    label: "Try Assists",
    description: "Try assists per match.",
    unit: "count",
    scope: "PLAYER_CLUB",
    aggregation: "mean",
    availability: "FREE",
    provenance: "rugbypy",
  }),
  def({
    id: "p_triesScored",
    label: "Tries Scored",
    description: "Tries scored (season total).",
    unit: "count",
    scope: "PLAYER_CLUB",
    aggregation: "sum",
    availability: "FREE",
    provenance: "rugbypy",
  }),
  def({
    id: "p_lineoutTakesPer80",
    label: "Lineout Takes per 80",
    description: "Lineout takes normalised to 80 minutes (official match centre).",
    unit: "count",
    scope: "PLAYER_CLUB",
    applicablePositions: FORWARD_GROUPS,
    aggregation: "rate",
    normalizationBasis: "per80",
    availability: "FREE",
    provenance: "matchCentre",
  }),
  def({
    id: "p_oppLineoutsStolen",
    label: "Opposition Lineouts Stolen",
    description: "Opposition lineout throws stolen per match (official match centre).",
    unit: "count",
    scope: "PLAYER_CLUB",
    applicablePositions: FORWARD_GROUPS,
    aggregation: "mean",
    availability: "FREE",
    provenance: "matchCentre",
  }),
  def({
    id: "p_kickVolume",
    label: "Kick Volume",
    description: "Kicks from hand per match (used as marker size).",
    unit: "count",
    scope: "PLAYER_CLUB",
    applicablePositions: ["flyHalf"],
    aggregation: "mean",
    availability: "FREE",
    provenance: "rugbypy",
  }),
  def({
    id: "p_metresCarried",
    label: "Metres Carried",
    description: "Metres made carrying per match.",
    unit: "metres",
    scope: "PLAYER_CLUB",
    aggregation: "mean",
    availability: "FREE",
    provenance: "rugbypy",
  }),
  def({
    id: "p_cleanBreaks",
    label: "Clean Breaks",
    description: "Clean line breaks per match.",
    unit: "count",
    scope: "PLAYER_CLUB",
    aggregation: "mean",
    availability: "FREE",
    provenance: "rugbypy",
  }),
  def({
    id: "p_tacklesMade",
    label: "Tackles Made",
    description: "Tackles made per match.",
    unit: "count",
    scope: "PLAYER_CLUB",
    aggregation: "mean",
    availability: "FREE",
    provenance: "rugbypy",
  }),
];

/* ============================= TEAM METRICS ============================= */

const TEAM_METRICS: MetricDefinition[] = [
  def({
    id: "t_postContactMetresPerRuck",
    label: "Post-Contact Metres per Ruck",
    description: "Team post-contact metres divided by rucks. Requires Opta event feed.",
    unit: "metres",
    scope: "TEAM_TEST",
    aggregation: "rate",
    normalizationBasis: "perRuck",
    availability: "PAID_UNAVAILABLE",
    provenance: "paidProvider",
  }),
  def({
    id: "t_lineBreaksPer100Rucks",
    label: "Line Breaks per 100 Rucks",
    description: "Line breaks normalised per 100 rucks. Requires Opta event feed.",
    unit: "count",
    scope: "TEAM_TEST",
    aggregation: "rate",
    normalizationBasis: "per100Rucks",
    availability: "PAID_UNAVAILABLE",
    provenance: "paidProvider",
  }),
  def({
    id: "t_visitsTo22",
    label: "Visits to Opposition 22",
    description: "Number of entries into the opposition 22. Requires Opta event feed.",
    unit: "count",
    scope: "TEAM_TEST",
    aggregation: "mean",
    availability: "PAID_UNAVAILABLE",
    provenance: "paidProvider",
  }),
  def({
    id: "t_pointsPerVisit",
    label: "Points per Visit to 22",
    description: "Points scored per visit to the opposition 22. Requires Opta event feed.",
    unit: "points",
    scope: "TEAM_TEST",
    aggregation: "rate",
    normalizationBasis: "perVisit",
    availability: "PAID_UNAVAILABLE",
    provenance: "paidProvider",
  }),
  def({
    id: "t_kicksPer100Rucks",
    label: "Kicks per 100 Rucks",
    description: "Kicks from hand per 100 rucks. Requires Opta event feed.",
    unit: "count",
    scope: "TEAM_TEST",
    aggregation: "rate",
    normalizationBasis: "per100Rucks",
    availability: "PAID_UNAVAILABLE",
    provenance: "paidProvider",
  }),
  def({
    id: "t_territoryPct",
    label: "Territory %",
    description: "Share of match played in the opposition half. Requires Opta event feed.",
    unit: "percent",
    scope: "TEAM_TEST",
    aggregation: "mean",
    availability: "PAID_UNAVAILABLE",
    provenance: "paidProvider",
  }),
  def({
    id: "t_postContactMetresPerCarry",
    label: "Post-Contact Metres per Carry",
    description: "Team post-contact metres divided by carries. Derived from free box-score.",
    unit: "metres",
    scope: "TEAM_TEST",
    aggregation: "rate",
    normalizationBasis: "perCarry",
    availability: "DERIVE",
    provenance: "derived",
  }),
  def({
    id: "t_rucksRecycledU3sPct",
    label: "Rucks Recycled < 3s %",
    description: "Share of rucks recycled in under 3 seconds. Requires Opta event feed.",
    unit: "percent",
    scope: "TEAM_TEST",
    aggregation: "mean",
    availability: "PAID_UNAVAILABLE",
    provenance: "paidProvider",
  }),
  def({
    id: "t_turnoversWon",
    label: "Turnovers Won",
    description: "Turnovers won per match.",
    unit: "count",
    scope: "TEAM_TEST",
    aggregation: "mean",
    availability: "FREE",
    provenance: "rugbypy",
  }),
  def({
    id: "t_scrumWinPctOwn",
    label: "Scrum Win % (own ball)",
    description: "Own scrum retention rate (official match centre).",
    unit: "percent",
    scope: "TEAM_TEST",
    aggregation: "mean",
    availability: "FREE",
    provenance: "matchCentre",
  }),
  def({
    id: "t_lineoutWinPctOwn",
    label: "Lineout Win % (own ball)",
    description: "Own lineout retention rate (official match centre).",
    unit: "percent",
    scope: "TEAM_TEST",
    aggregation: "mean",
    availability: "FREE",
    provenance: "matchCentre",
  }),
  def({
    id: "t_restartRetentionPct",
    label: "Restart Retention %",
    description: "Own restart retention rate. Derived from free box-score.",
    unit: "percent",
    scope: "TEAM_TEST",
    aggregation: "mean",
    availability: "DERIVE",
    provenance: "derived",
  }),
  def({
    id: "t_setPieceWinPctOwnBall",
    label: "Set-Piece Win % (own ball)",
    description: "Weighted scrum + lineout + restart retention on own ball.",
    unit: "percent",
    scope: "TEAM_TEST",
    aggregation: "weighted",
    availability: "DERIVE",
    provenance: "derived",
    components: [
      { metricId: "t_scrumWinPctOwn", weight: 1 },
      { metricId: "t_lineoutWinPctOwn", weight: 2 },
      { metricId: "t_restartRetentionPct", weight: 1 },
    ],
  }),
  def({
    id: "t_penaltiesConceded",
    label: "Penalties Conceded",
    description: "Penalties conceded per match. Lower is better.",
    unit: "count",
    scope: "TEAM_TEST",
    aggregation: "mean",
    availability: "FREE",
    provenance: "rugbypy",
    higherIsBetter: false,
  }),
  def({
    id: "t_tacklesMade",
    label: "Tackles Made",
    description: "Team tackles made per match.",
    unit: "count",
    scope: "TEAM_TEST",
    aggregation: "mean",
    availability: "FREE",
    provenance: "rugbypy",
  }),
  def({
    id: "t_dominantTackles",
    label: "Dominant Tackles",
    description: "Team dominant tackles per match (RugbyPass deep metric).",
    unit: "count",
    scope: "TEAM_TEST",
    aggregation: "mean",
    availability: "FREE",
    provenance: "rugbypass",
  }),
  def({
    id: "t_tackleCompletionPct",
    label: "Tackle Completion %",
    description: "Share of attempted tackles completed.",
    unit: "percent",
    scope: "TEAM_TEST",
    aggregation: "mean",
    availability: "FREE",
    provenance: "rugbypy",
  }),
  def({
    id: "t_oppPassesPerSuccessTackle",
    label: "Opp Passes per Successful Tackle",
    description: "Opposition passes allowed per successful tackle. Low = blitz, high = drift. Requires Opta event feed.",
    unit: "ratio",
    scope: "TEAM_TEST",
    aggregation: "mean",
    availability: "PAID_UNAVAILABLE",
    provenance: "paidProvider",
  }),
  def({
    id: "t_lineBreaksConcededPossAdj",
    label: "Line Breaks Conceded (poss-adj)",
    description: "Line breaks conceded, adjusted for possession. Lower is better. Requires Opta event feed.",
    unit: "index",
    scope: "TEAM_TEST",
    aggregation: "mean",
    availability: "PAID_UNAVAILABLE",
    provenance: "paidProvider",
    higherIsBetter: false,
  }),
  def({
    id: "t_turnoversLost",
    label: "Turnovers Lost",
    description: "Turnovers lost per match. Lower is better.",
    unit: "count",
    scope: "TEAM_TEST",
    aggregation: "mean",
    availability: "FREE",
    provenance: "rugbypy",
    higherIsBetter: false,
  }),
  def({
    id: "t_turnoversLostForced",
    label: "Turnovers Lost — Forced",
    description: "Turnovers lost through opposition pressure. Requires Opta event feed.",
    unit: "count",
    scope: "TEAM_TEST",
    aggregation: "mean",
    availability: "PAID_UNAVAILABLE",
    provenance: "paidProvider",
    higherIsBetter: false,
  }),
  def({
    id: "t_turnoversLostUnforced",
    label: "Turnovers Lost — Unforced",
    description: "Turnovers lost through own error. Requires Opta event feed.",
    unit: "count",
    scope: "TEAM_TEST",
    aggregation: "mean",
    availability: "PAID_UNAVAILABLE",
    provenance: "paidProvider",
    higherIsBetter: false,
  }),
];

export const ALL_METRICS: MetricDefinition[] = [...PLAYER_METRICS, ...TEAM_METRICS];

// Fail loud at module load if any duplicate id slipped in.
const _seen = new Set<string>();
for (const m of ALL_METRICS) {
  if (_seen.has(m.id)) throw new Error(`Duplicate metric id in registry: ${m.id}`);
  _seen.add(m.id);
}

const _byId = new Map<string, MetricDefinition>(ALL_METRICS.map((m) => [m.id, m]));

export function getMetric(id: string): MetricDefinition {
  const m = _byId.get(id);
  if (!m) throw new Error(`Unknown metric id: ${id}`);
  return m;
}

export function tryGetMetric(id: string): MetricDefinition | undefined {
  return _byId.get(id);
}

export function metricsForScope(scope: Scope): MetricDefinition[] {
  return ALL_METRICS.filter((m) => m.scope === scope);
}

export function metricsCatalog(): MetricsCatalog {
  return MetricsCatalog.parse({ metrics: ALL_METRICS });
}
