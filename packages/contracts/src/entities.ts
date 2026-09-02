import { z } from "zod";

/**
 * Core domain entities and enumerations for RuckMetrics.
 * These are the vocabulary the entire system shares; everything downstream
 * (store, derivation, API, frontend) validates against these schemas.
 */

/** Rugby shirt numbers 1..15 for starting positions. */
export const PositionCode = z.enum([
  "1", // loosehead prop
  "2", // hooker
  "3", // tighthead prop
  "4", // lock
  "5", // lock
  "6", // blindside flanker
  "7", // openside flanker
  "8", // number 8
  "9", // scrum-half
  "10", // fly-half
  "11", // left wing
  "12", // inside centre
  "13", // outside centre
  "14", // right wing
  "15", // fullback
]);
export type PositionCode = z.infer<typeof PositionCode>;

/**
 * Position groups used for positional-percentile cohorts. Percentiles are only
 * meaningful within a peer group (you don't rank a prop's metres against a wing).
 * Groups are intentionally granular; broader groupings (forwards/backs) are
 * derived from these so a preset can target either level.
 */
export const PositionGroup = z.enum([
  "frontRow", // 1, 2, 3
  "locks", // 4, 5
  "looseForwards", // 6, 7, 8
  "scrumHalf", // 9
  "flyHalf", // 10
  "centres", // 12, 13
  "backThree", // 11, 14, 15
]);
export type PositionGroup = z.infer<typeof PositionGroup>;

/** Broad groupings some presets filter on (e.g. "forwards", "backs"). */
export const BroadPositionGroup = z.enum(["forwards", "backs"]);
export type BroadPositionGroup = z.infer<typeof BroadPositionGroup>;

/** Static mapping shirt number -> fine-grained position group. */
export const POSITION_GROUP_BY_CODE: Record<PositionCode, PositionGroup> = {
  "1": "frontRow",
  "2": "frontRow",
  "3": "frontRow",
  "4": "locks",
  "5": "locks",
  "6": "looseForwards",
  "7": "looseForwards",
  "8": "looseForwards",
  "9": "scrumHalf",
  "10": "flyHalf",
  "11": "backThree",
  "12": "centres",
  "13": "centres",
  "14": "backThree",
  "15": "backThree",
};

export const FORWARD_GROUPS: PositionGroup[] = ["frontRow", "locks", "looseForwards"];
export const BACK_GROUPS: PositionGroup[] = ["scrumHalf", "flyHalf", "centres", "backThree"];

export function broadGroupOf(group: PositionGroup): BroadPositionGroup {
  return FORWARD_GROUPS.includes(group) ? "forwards" : "backs";
}

/** Competition identifiers. Extend as adapters cover more comps. */
export const Competition = z.enum([
  "URC", // United Rugby Championship
  "SUPER_RUGBY", // Super Rugby Pacific
  "NATIONS_CHAMPIONSHIP", // test-level Nations Championship
  "TEST_MATCH", // generic international test window
]);
export type Competition = z.infer<typeof Competition>;

/** A season label, e.g. "2024-25" for club, "2025" for a test year. */
export const Season = z.string().regex(/^\d{4}(-\d{2})?$/, "season must look like 2025 or 2024-25");
export type Season = z.infer<typeof Season>;

/** Analysis scope: club player analysis vs test-team analysis. */
export const Scope = z.enum(["PLAYER_CLUB", "TEAM_TEST"]);
export type Scope = z.infer<typeof Scope>;

export const EntityKind = z.enum(["PLAYER", "TEAM"]);
export type EntityKind = z.infer<typeof EntityKind>;

export const Player = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  teamId: z.string().min(1),
  /** Primary position; a player may have appearances at others (see stat rows). */
  position: PositionCode,
});
export type Player = z.infer<typeof Player>;

/**
 * A CSS colour (e.g. "#123456") as packed into a kit/team colour list.
 * Stored loosely as hex so any consumer can drop it straight into SVG/fill.
 */
export const TeamColour = z.string().regex(/^#[0-9a-fA-F]{6}$/, "colour must be #RRGGBB");
export type TeamColour = z.infer<typeof TeamColour>;

/**
 * A team's kit colours, ordered primary-first. The first entry is used as the
 * point/marker colour wherever a single colour is needed; extra entries are
 * available for multi-colour kit rendering.
 */
export const TeamColours = z.array(TeamColour).min(1).default(["#000000"]);
export type TeamColours = z.infer<typeof TeamColours>;

export const Team = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  competition: Competition,
  /** True for national test squads (used by the 12-squad / test-median benchmarks). */
  isNational: z.boolean().default(false),
  /** Kit colours used to tint this team's points on charts. */
  colours: TeamColours,
});
export type Team = z.infer<typeof Team>;
