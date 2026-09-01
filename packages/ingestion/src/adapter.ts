import type {
  Competition,
  EntityKind,
  PositionCode,
  ProvenanceSource,
  Scope,
  Season,
} from "@ruckmetrics/contracts";

/**
 * THE PROVIDER/ADAPTER BOUNDARY.
 *
 * The whole point of this file is that a paid event feed (Opta / Sportradar) can
 * drop in later behind {@link DataSourceAdapter} WITHOUT any downstream code —
 * the ETL, the store, derivation, the API — changing. Every source of data, free
 * or paid, player-scope or team-scope, is exactly one `DataSourceAdapter`.
 *
 * An adapter's job is narrow and honest:
 *   1. Declare which {@link ProvenanceSource} it represents.
 *   2. Fetch raw rows for a competition + season and normalise them into
 *      {@link RawContribution}s — partial, source-scoped slices of a match stat
 *      record. The ETL merges contributions from every adapter into the complete
 *      {@link MatchStatRecord}s the store persists.
 *
 * An adapter NEVER imputes. If the upstream is missing an optional field it
 * simply omits the key from `values`; if the upstream is malformed it throws.
 * A "hard down" upstream (binary missing, network unreachable) is signalled with
 * {@link AdapterUnavailableError} so the ETL can fall back to recorded fixtures
 * rather than silently producing an empty dataset.
 */

/** The query an adapter is asked to satisfy: one competition + season + scope. */
export interface FetchQuery {
  scope: Scope;
  competition: Competition;
  season: Season;
}

/**
 * A partial, source-scoped contribution to a single subject's single match.
 *
 * `values` holds ONLY the metric ids (and reserved denominator fields) this
 * particular source is responsible for. For rate metrics the value is the
 * per-match NUMERATOR, and the contribution MUST also carry the matching
 * denominator field (minutesPlayed / teamRucks / visitsTo22 / carries) — the
 * derivation layer requires numerator and denominator to sit on the same record.
 *
 * The ETL turns each contribution into one MatchStatRecord whose provenance is
 * this adapter's `source`, so freshness stays granular per source.
 */
export interface RawContribution {
  entityKind: EntityKind;
  /** Player id or Team id (stable slug). */
  subjectId: string;
  /** Owning team id for player rows (lets the ETL build the Player entity). */
  teamId?: string;
  matchId: string;
  competition: Competition;
  season: Season;
  /** Position played in this match (players only); omit/null for team rows. */
  position?: PositionCode | null;
  /** Metric numerators + reserved denominator fields this source provides. */
  values: Record<string, number>;
}

/**
 * A data source. Free sources (rugbypy box-score, RugbyPass deep metrics,
 * official match centre) and the paid provider slot all implement this.
 */
export interface DataSourceAdapter {
  /** Provenance stamped onto every record built from this adapter's rows. */
  readonly source: ProvenanceSource;

  /** Human-facing name for logs. */
  readonly name: string;

  /**
   * Cheap, idempotent liveness check. Resolves if the source can be used now;
   * throws {@link AdapterUnavailableError} if it cannot (e.g. the rugbypy python
   * package is not installed, or the paid provider has no credentials). The ETL
   * probes before fetching so it can decide to fall back to fixtures.
   */
  probe(): Promise<void>;

  /**
   * Fetch and normalise rows for the query directly from the live upstream. May
   * throw {@link AdapterUnavailableError} (upstream down) or a validation error
   * (upstream returned malformed data — fail loud, never impute).
   */
  fetchLive(query: FetchQuery): Promise<RawContribution[]>;

  /**
   * Load the same shape from a recorded fixture on disk. Used by tests (which
   * never hit the network) and by the ETL as a graceful fallback when the live
   * source is unavailable. Deterministic.
   */
  fetchFixture(query: FetchQuery): Promise<RawContribution[]>;

  /**
   * Convenience the ETL calls: probe + fetchLive, falling back to fetchFixture
   * on {@link AdapterUnavailableError}. Returns the rows plus which mode was
   * actually used so the ETL can log it. Malformed-data errors are NOT caught
   * here — they must surface.
   */
  fetch(query: FetchQuery): Promise<FetchOutcome>;
}

export interface FetchOutcome {
  source: ProvenanceSource;
  mode: "live" | "fixture";
  rows: RawContribution[];
}

/**
 * Thrown when a source is structurally unavailable in this environment (missing
 * binary, missing credentials, unreachable host). This is the ONLY error the ETL
 * treats as "fall back to fixtures"; every other error is a real failure.
 */
export class AdapterUnavailableError extends Error {
  readonly source: ProvenanceSource;
  constructor(source: ProvenanceSource, message: string) {
    super(`[${source}] unavailable: ${message}`);
    this.name = "AdapterUnavailableError";
    this.source = source;
  }
}

/**
 * Thrown when an upstream returns data we cannot trust (missing required field,
 * NaN, wrong shape). Fail loud — never impute. Distinct from
 * {@link AdapterUnavailableError} so the ETL does NOT swallow it as a fallback.
 */
export class MalformedSourceError extends Error {
  readonly source: ProvenanceSource;
  constructor(source: ProvenanceSource, message: string) {
    super(`[${source}] malformed source data: ${message}`);
    this.name = "MalformedSourceError";
    this.source = source;
  }
}

/**
 * Shared base that implements the {@link DataSourceAdapter.fetch} fallback dance
 * once, so concrete adapters only implement probe/fetchLive/fetchFixture.
 */
export abstract class BaseAdapter implements DataSourceAdapter {
  abstract readonly source: ProvenanceSource;
  abstract readonly name: string;
  abstract probe(): Promise<void>;
  abstract fetchLive(query: FetchQuery): Promise<RawContribution[]>;
  abstract fetchFixture(query: FetchQuery): Promise<RawContribution[]>;

  async fetch(query: FetchQuery): Promise<FetchOutcome> {
    try {
      await this.probe();
      const rows = await this.fetchLive(query);
      return { source: this.source, mode: "live", rows };
    } catch (err) {
      if (err instanceof AdapterUnavailableError) {
        const rows = await this.fetchFixture(query);
        return { source: this.source, mode: "fixture", rows };
      }
      throw err;
    }
  }
}

/** Assert a value is a finite number or fail loud with source context. */
export function requireFinite(source: ProvenanceSource, field: string, v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) {
    throw new MalformedSourceError(source, `field '${field}' is not a finite number: ${String(v)}`);
  }
  return v;
}
