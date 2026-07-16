import { z } from "zod";
import { Competition, EntityKind, PositionCode, Scope, Season } from "./entities.js";
import { ProvenanceSource } from "./metrics.js";

/**
 * The normalized store's fact row. Ingestion adapters emit these; the store
 * persists them; derivation reads them. Every record carries provenance and a
 * fetch timestamp so data-freshness is a first-class, queryable property.
 *
 * Raw values live in an open map keyed by metric id. This keeps the store schema
 * stable as the registry grows — new metrics are new keys, not new columns.
 */

export const Provenance = z.object({
  source: ProvenanceSource,
  /** Source URL / dataset identifier the row was fetched from, if applicable. */
  url: z.string().nullable().default(null),
  /** ISO-8601 timestamp of when this row was fetched/derived. */
  fetchedAt: z.string().datetime(),
});
export type Provenance = z.infer<typeof Provenance>;

/**
 * Reserved raw denominator field ids that may appear in a record's `values`.
 * The derivation layer resolves a metric's NormalizationBasis to one of these.
 * They are ordinary keys in `values`, documented here so the whole system agrees
 * on the names.
 */
export const DENOMINATOR_FIELDS = {
  per80: "minutesPlayed",
  perRuck: "teamRucks",
  per100Rucks: "teamRucks",
  perVisit: "visitsTo22",
  perCarry: "carries",
} as const;

export const MatchStatRecord = z.object({
  /** Deterministic id: `${entityKind}:${subjectId}:${matchId}` — enables idempotent upserts. */
  id: z.string().min(1),
  entityKind: EntityKind,
  /** Player id or Team id depending on entityKind. */
  subjectId: z.string().min(1),
  matchId: z.string().min(1),
  competition: Competition,
  season: Season,
  /** Position played in THIS match (players only); null for team rows. */
  position: PositionCode.nullable().default(null),
  /**
   * Raw metric values for this match, keyed by metric id. Also holds reserved
   * denominator fields (minutesPlayed, teamRucks, visitsTo22, carries).
   * Missing metric => key absent. Derivation FAILS LOUD on required-but-absent
   * values rather than imputing.
   */
  values: z.record(z.string(), z.number()),
  provenance: Provenance,
});
export type MatchStatRecord = z.infer<typeof MatchStatRecord>;

/**
 * Data-freshness summary exposed by the API: per source, the newest and oldest
 * fetch timestamps and row counts currently in the store.
 */
export const FreshnessEntry = z.object({
  source: ProvenanceSource,
  scope: Scope.nullable().default(null),
  rowCount: z.number().int().nonnegative(),
  newestFetchedAt: z.string().datetime().nullable(),
  oldestFetchedAt: z.string().datetime().nullable(),
});
export type FreshnessEntry = z.infer<typeof FreshnessEntry>;
