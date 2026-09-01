import {
  BaseAdapter,
  type FetchQuery,
  type RawContribution,
} from "../adapter.js";

/**
 * PAID PROVIDER SLOT, provenance `paidProvider`.
 *
 * This is the seam a real Opta / Sportradar event-feed adapter drops into. It
 * implements {@link DataSourceAdapter} exactly like every free source, so the
 * ETL, store, derivation, API and frontend need ZERO changes when a paid feed
 * lands — you replace this file's body with real fetch + mapping logic and the
 * PAID_UNAVAILABLE metrics light up automatically.
 *
 * The metrics it OWNS (all currently PAID_UNAVAILABLE in the registry):
 *   t_postContactMetresPerRuck, t_lineBreaksPer100Rucks, t_visitsTo22,
 *   t_pointsPerVisit, t_kicksPer100Rucks, t_territoryPct,
 *   t_rucksRecycledU3sPct, t_oppPassesPerSuccessTackle,
 *   t_lineBreaksConcededPossAdj, t_turnoversLostForced, t_turnoversLostUnforced
 *
 * Until a real feed is wired in it produces NOTHING — deliberately. The frontend
 * reads `availability: PAID_UNAVAILABLE` from the registry and disables those
 * pickers, so an empty result here is the correct, expected behaviour.
 *
 * HOW A REAL ADAPTER WOULD SLOT IN:
 *   1. In `probe()`, verify credentials (e.g. an OPTA_API_KEY env var) and throw
 *      AdapterUnavailableError if absent, so the ETL degrades gracefully.
 *   2. In `fetchLive()`, call the vendor endpoint (through DiskCache + a
 *      RateLimiter, exactly like RugbyPassAdapter), map events -> the metric ids
 *      above, and write the reserved denominators (teamRucks / visitsTo22 /
 *      carries) onto the same record as each rate numerator.
 *   3. Leave the rest of the system untouched.
 */
export class PaidProviderAdapter extends BaseAdapter {
  readonly source = "paidProvider" as const;
  readonly name = "Paid Provider (Opta/Sportradar) — not yet implemented";

  /**
   * Not implemented => not available. Returning "unavailable" (rather than
   * throwing NotImplemented from fetch) means the ETL simply records zero paid
   * rows and moves on, which is the intended state until a feed is purchased.
   */
  async probe(): Promise<void> {
    // Intentionally a no-op resolve: the adapter is "up" but produces nothing.
    // (Switch to throwing AdapterUnavailableError once real credentials gate it.)
  }

  async fetchLive(_query: FetchQuery): Promise<RawContribution[]> {
    // No paid feed wired in — emit nothing. This is intentional, not a failure.
    return [];
  }

  async fetchFixture(_query: FetchQuery): Promise<RawContribution[]> {
    return [];
  }
}

/** Thrown by a future real adapter for endpoints it hasn't implemented yet. */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`Not implemented: ${what}`);
    this.name = "NotImplementedError";
  }
}
