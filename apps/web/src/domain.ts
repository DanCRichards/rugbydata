// Runtime vocabulary mirrored locally.
//
// The @ruckmetrics/contracts / @ruckmetrics/api packages are imported TYPE-ONLY
// so that no server-side code is pulled into the browser bundle. The enums below
// are small, stable value-lists that the type system still checks against the
// canonical contract types (each array is declared `: readonly <Type>[]`), so a
// drift from the contract enum is a compile error.

import type {
  Availability,
  BenchmarkOverlay,
  BroadPositionGroup,
  Competition,
  MetricDefinition,
  PercentileMode,
  PositionGroup,
  Scope,
} from "@ruckmetrics/contracts";

export const SCOPES: readonly { value: Scope; label: string }[] = [
  { value: "PLAYER_CLUB", label: "Player · Club" },
  { value: "TEAM_TEST", label: "Team · Test" },
];

export const POSITION_GROUPS: readonly { value: PositionGroup; label: string }[] = [
  { value: "frontRow", label: "Front Row" },
  { value: "locks", label: "Locks" },
  { value: "looseForwards", label: "Loose Forwards" },
  { value: "scrumHalf", label: "Scrum-half" },
  { value: "flyHalf", label: "Fly-half" },
  { value: "centres", label: "Centres" },
  { value: "backThree", label: "Back Three" },
];

export const BROAD_GROUPS: readonly { value: BroadPositionGroup; label: string }[] = [
  { value: "forwards", label: "Forwards" },
  { value: "backs", label: "Backs" },
];

/** Competition options offered per scope (derived from the seed presets/enums). */
export const COMPETITIONS_BY_SCOPE: Record<Scope, readonly { value: Competition; label: string }[]> = {
  PLAYER_CLUB: [
    { value: "URC", label: "United Rugby Championship" },
    { value: "SUPER_RUGBY", label: "Super Rugby Pacific" },
  ],
  TEAM_TEST: [
    { value: "NATIONS_CHAMPIONSHIP", label: "Nations Championship" },
    { value: "TEST_MATCH", label: "Test Match window" },
  ],
};

/** Season options offered per scope. */
export const SEASONS_BY_SCOPE: Record<Scope, readonly string[]> = {
  PLAYER_CLUB: ["2024-25", "2023-24"],
  TEAM_TEST: ["2025", "2024"],
};

export const PERCENTILE_MODES: readonly { value: PercentileMode; label: string }[] = [
  { value: "raw", label: "Raw values" },
  { value: "positional", label: "Positional percentile" },
];

export const BENCHMARK_OVERLAYS: readonly { value: BenchmarkOverlay; label: string }[] = [
  { value: "none", label: "None" },
  { value: "twelveSquadMedian", label: "12-squad median" },
  { value: "testMedian", label: "Test median (2023–26)" },
];

export function defaultCompetition(scope: Scope): Competition {
  return COMPETITIONS_BY_SCOPE[scope][0]!.value;
}

export function defaultSeason(scope: Scope): string {
  return SEASONS_BY_SCOPE[scope][0]!;
}

/** The single availability gate the frontend enforces (mirrors contracts.isAvailable). */
export function isMetricAvailable(m: Pick<MetricDefinition, "availability">): boolean {
  return m.availability !== "PAID_UNAVAILABLE";
}

export const PAID_TOOLTIP =
  "Requires a paid data provider (Opta/Sportradar) — not yet available.";

export function availabilityBadge(a: Availability): string {
  switch (a) {
    case "FREE":
      return "free";
    case "DERIVE":
      return "derived";
    case "PAID_UNAVAILABLE":
      return "paid";
  }
}

/** A deterministic categorical colour palette for series/legends. */
export const PALETTE: readonly string[] = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#e11d48",
  "#0d9488",
  "#9333ea",
  "#ca8a04",
];

/** Stable colour assignment: same key always maps to the same palette slot. */
export function colorFor(key: string, keys: string[]): string {
  const idx = keys.indexOf(key);
  return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length]!;
}

export function positionGroupLabel(g: PositionGroup | null): string {
  if (g === null) return "—";
  return POSITION_GROUPS.find((p) => p.value === g)?.label ?? g;
}

/** Format an axis value with its unit for tooltips/labels. */
export function formatValue(v: number | null, unit: string, percentile: boolean): string {
  if (v === null || Number.isNaN(v)) return "—";
  const n = Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1);
  if (percentile) return `${n} pct`;
  switch (unit) {
    case "percent":
      return `${n}%`;
    case "metres":
      return `${n} m`;
    case "seconds":
      return `${n} s`;
    default:
      return n;
  }
}
