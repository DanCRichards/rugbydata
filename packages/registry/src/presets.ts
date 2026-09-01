import {
  Preset,
  type ChartDefinition,
  type Competition,
} from "@ruckmetrics/contracts";
import { getMetric } from "./metrics.js";

/**
 * THE 22 SEED PRESETS.
 *
 * Each named analysis from the spec is nothing more than a ChartDefinition fed
 * to the one engine. There are no bespoke pages. A preset that references an
 * unavailable (PAID) metric is still valid and still ships — the engine simply
 * renders it empty with an "unavailable metric" notice and the picker disables
 * the axis. This keeps the paid slots wired and ready.
 */

const CLUB: Competition = "URC";
const CLUB_SEASON = "2024-25";
const TEST: Competition = "NATIONS_CHAMPIONSHIP";
const TEST_SEASON = "2025";

interface P {
  id: string;
  name: string;
  specRef: string;
  description?: string;
  def: Partial<ChartDefinition> & Pick<ChartDefinition, "scope" | "xMetric">;
}

function preset(p: P): Preset {
  const scope = p.def.scope;
  const competition = p.def.competition ?? (scope === "PLAYER_CLUB" ? CLUB : TEST);
  const season = p.def.season ?? (scope === "PLAYER_CLUB" ? CLUB_SEASON : TEST_SEASON);
  const definition: ChartDefinition = {
    scope,
    chartType: p.def.chartType ?? "scatter",
    xMetric: p.def.xMetric,
    yMetric: p.def.yMetric ?? null,
    sizeMetric: p.def.sizeMetric ?? null,
    positionFilter: p.def.positionFilter ?? { groups: [], broad: null },
    competition,
    season,
    percentileMode: p.def.percentileMode ?? "raw",
    benchmarkOverlay: p.def.benchmarkOverlay ?? "none",
    axisFlips: p.def.axisFlips ?? { x: false, y: false },
    categoryMetrics: p.def.categoryMetrics ?? [],
    stackMetrics: p.def.stackMetrics ?? [],
  };
  return Preset.parse({
    id: p.id,
    name: p.name,
    description: p.description ?? "",
    specRef: p.specRef,
    definition,
  });
}

export const SEED_PRESETS: Preset[] = [
  /* ===================== PART 1 — PLAYER & POSITION ===================== */
  preset({
    id: "p1-carrier-dna",
    name: "Carrier DNA",
    specRef: "P1#1",
    description: "Who beats defenders vs who grinds out post-contact metres.",
    def: { scope: "PLAYER_CLUB", xMetric: "p_defendersBeaten", yMetric: "p_postContactMetres" },
  }),
  preset({
    id: "p1-breakdown-dna",
    name: "Breakdown DNA",
    specRef: "P1#2",
    description: "Turnovers won vs ruck arrival effectiveness (locks & loose forwards).",
    def: {
      scope: "PLAYER_CLUB",
      xMetric: "p_turnoversWon",
      yMetric: "p_ruckArrivalEffect",
      positionFilter: { groups: ["locks", "looseForwards"], broad: null },
    },
  }),
  preset({
    id: "p1-enforcer-map",
    name: "Enforcer Map",
    specRef: "P1#3",
    description: "Tackle volume vs dominance.",
    def: { scope: "PLAYER_CLUB", xMetric: "p_tacklesPer80", yMetric: "p_dominantTacklePct" },
  }),
  preset({
    id: "p1-clean-engine",
    name: "Clean Engine",
    specRef: "P1#4",
    description: "High work-rate with low penalties — shown as positional percentiles.",
    def: {
      scope: "PLAYER_CLUB",
      xMetric: "p_penaltiesConceded",
      yMetric: "p_workRate",
      percentileMode: "positional",
    },
  }),
  preset({
    id: "p1-jackal-roi",
    name: "Jackal ROI",
    specRef: "P1#5",
    description: "Turnovers won against penalties conceded — the jackal's risk/reward.",
    def: { scope: "PLAYER_CLUB", xMetric: "p_turnoversWon", yMetric: "p_penaltiesConceded" },
  }),
  preset({
    id: "p1-two-way-beasts",
    name: "Two-Way Beasts",
    specRef: "P1#6",
    description: "Post-contact metres vs dominant tackle % — both sides of the ball.",
    def: { scope: "PLAYER_CLUB", xMetric: "p_postContactMetres", yMetric: "p_dominantTacklePct" },
  }),
  preset({
    id: "p1-creators-finishers",
    name: "Creators / Finishers",
    specRef: "P1#7",
    description: "Try assists vs tries scored.",
    def: { scope: "PLAYER_CLUB", xMetric: "p_tryAssists", yMetric: "p_triesScored" },
  }),
  preset({
    id: "p1-lineout-general",
    name: "Lineout General",
    specRef: "P1#8",
    description: "Lineout takes vs opposition lineouts stolen (forwards).",
    def: {
      scope: "PLAYER_CLUB",
      xMetric: "p_lineoutTakesPer80",
      yMetric: "p_oppLineoutsStolen",
      positionFilter: { groups: [], broad: "forwards" },
    },
  }),
  preset({
    id: "p1-triple-threats",
    name: "Triple Threats",
    specRef: "P1#9",
    description: "Fly-halves: assists vs defenders beaten, sized by kick volume.",
    def: {
      scope: "PLAYER_CLUB",
      xMetric: "p_tryAssists",
      yMetric: "p_defendersBeaten",
      sizeMetric: "p_kickVolume",
      positionFilter: { groups: ["flyHalf"], broad: null },
    },
  }),
  preset({
    id: "p1-final-summary",
    name: "Final Summary",
    specRef: "P1#10",
    description: "Nine stat categories per squad against the 12-squad median (radar).",
    def: {
      scope: "PLAYER_CLUB",
      chartType: "radar",
      xMetric: "p_defendersBeaten",
      benchmarkOverlay: "twelveSquadMedian",
      categoryMetrics: [
        "p_defendersBeaten",
        "p_postContactMetres",
        "p_tacklesMade",
        "p_dominantTacklePct",
        "p_turnoversWon",
        "p_tryAssists",
        "p_triesScored",
        "p_metresCarried",
        "p_cleanBreaks",
      ],
    },
  }),

  /* ===================== PART 2 — TEAM MATCH ANALYSIS ===================== */
  preset({
    id: "p2-attack-shape",
    name: "Attack Shape",
    specRef: "P2#1",
    description: "Post-contact metres per ruck vs line breaks per 100 rucks.",
    def: {
      scope: "TEAM_TEST",
      xMetric: "t_postContactMetresPerRuck",
      yMetric: "t_lineBreaksPer100Rucks",
      benchmarkOverlay: "testMedian",
    },
  }),
  preset({
    id: "p2-execution",
    name: "Execution",
    specRef: "P2#2",
    description: "Visits to the 22 vs points per visit.",
    def: {
      scope: "TEAM_TEST",
      xMetric: "t_visitsTo22",
      yMetric: "t_pointsPerVisit",
      benchmarkOverlay: "testMedian",
    },
  }),
  preset({
    id: "p2-kicking-management",
    name: "Kicking Management",
    specRef: "P2#3",
    description: "Kicks per 100 rucks vs territory %.",
    def: {
      scope: "TEAM_TEST",
      xMetric: "t_kicksPer100Rucks",
      yMetric: "t_territoryPct",
      benchmarkOverlay: "testMedian",
    },
  }),
  preset({
    id: "p2-collision-tempo",
    name: "Collision & Tempo",
    specRef: "P2#4",
    description: "Post-contact metres per carry vs rucks recycled under 3s.",
    def: {
      scope: "TEAM_TEST",
      xMetric: "t_postContactMetresPerCarry",
      yMetric: "t_rucksRecycledU3sPct",
      benchmarkOverlay: "testMedian",
    },
  }),
  preset({
    id: "p2-breakdown-priorities",
    name: "Breakdown Priorities",
    specRef: "P2#5",
    description: "Ruck recycle speed vs turnovers won.",
    def: {
      scope: "TEAM_TEST",
      xMetric: "t_rucksRecycledU3sPct",
      yMetric: "t_turnoversWon",
      benchmarkOverlay: "testMedian",
    },
  }),
  preset({
    id: "p2-set-piece-discipline",
    name: "Set Piece & Discipline",
    specRef: "P2#6",
    description: "Set-piece win % on own ball vs penalties conceded (y-flipped).",
    def: {
      scope: "TEAM_TEST",
      xMetric: "t_setPieceWinPctOwnBall",
      yMetric: "t_penaltiesConceded",
      axisFlips: { x: false, y: true },
      benchmarkOverlay: "testMedian",
    },
  }),
  preset({
    id: "p2-defence-first",
    name: "Defence First",
    specRef: "P2#7",
    description: "Tackles made vs dominant tackles.",
    def: {
      scope: "TEAM_TEST",
      xMetric: "t_tacklesMade",
      yMetric: "t_dominantTackles",
      benchmarkOverlay: "testMedian",
    },
  }),
  preset({
    id: "p2-blitz-or-drift",
    name: "Blitz or Drift",
    specRef: "P2#8",
    description: "Opposition passes per successful tackle — low = blitz, high = drift (ranked strip).",
    def: {
      scope: "TEAM_TEST",
      chartType: "strip",
      xMetric: "t_oppPassesPerSuccessTackle",
    },
  }),
  preset({
    id: "p2-line-break-prevention",
    name: "Line Break Prevention",
    specRef: "P2#9",
    description: "Line breaks conceded (poss-adj) vs opp passes per tackle (both axes flipped).",
    def: {
      scope: "TEAM_TEST",
      xMetric: "t_lineBreaksConcededPossAdj",
      yMetric: "t_oppPassesPerSuccessTackle",
      axisFlips: { x: true, y: true },
      benchmarkOverlay: "testMedian",
    },
  }),
  preset({
    id: "p2-tackle-completion",
    name: "Tackle Completion",
    specRef: "P2#10",
    description: "Opp passes per successful tackle vs tackle completion %.",
    def: {
      scope: "TEAM_TEST",
      xMetric: "t_oppPassesPerSuccessTackle",
      yMetric: "t_tackleCompletionPct",
      benchmarkOverlay: "testMedian",
    },
  }),
  preset({
    id: "p2-turnover-battle",
    name: "The Turnover Battle",
    specRef: "P2#11",
    description: "Turnovers won vs turnovers lost (y-flipped so fewer losses sits high).",
    def: {
      scope: "TEAM_TEST",
      xMetric: "t_turnoversWon",
      yMetric: "t_turnoversLost",
      axisFlips: { x: false, y: true },
      benchmarkOverlay: "testMedian",
    },
  }),
  preset({
    id: "p2-turnovers-lost-split",
    name: "Turnovers Lost Split",
    specRef: "P2#12",
    description: "Turnovers lost split into forced vs unforced (stacked bar).",
    def: {
      scope: "TEAM_TEST",
      chartType: "stackedBar",
      xMetric: "t_turnoversLostForced",
      stackMetrics: ["t_turnoversLostForced", "t_turnoversLostUnforced"],
    },
  }),
];

// Fail loud on duplicate preset ids or dangling metric references.
const _seenPreset = new Set<string>();
for (const p of SEED_PRESETS) {
  if (_seenPreset.has(p.id)) throw new Error(`Duplicate preset id: ${p.id}`);
  _seenPreset.add(p.id);
  const d = p.definition;
  const refs = [
    d.xMetric,
    d.yMetric,
    d.sizeMetric,
    ...d.categoryMetrics,
    ...d.stackMetrics,
  ].filter((x): x is string => typeof x === "string" && x.length > 0);
  for (const ref of refs) {
    const m = getMetric(ref); // throws if unknown
    if (m.scope !== d.scope) {
      throw new Error(`Preset ${p.id} references metric ${ref} of wrong scope (${m.scope} != ${d.scope})`);
    }
  }
}

const _presetById = new Map<string, Preset>(SEED_PRESETS.map((p) => [p.id, p]));
export function getPreset(id: string): Preset | undefined {
  return _presetById.get(id);
}
