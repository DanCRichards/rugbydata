/**
 * @ruckmetrics/ingestion — the ingestion layer.
 *
 * Provider/adapter pattern: every data source (free or paid) implements
 * DataSourceAdapter; the ETL merges their contributions into validated
 * MatchStatRecords; the seed generator synthesizes a deterministic demo dataset.
 */

export * from "./adapter.js";
export * from "./cache.js";
export * from "./rate-limiter.js";
export * from "./prng.js";
export * from "./etl.js";
export * from "./seed.js";

export { RugbyPyAdapter } from "./adapters/rugbypy.js";
export { RugbyPassAdapter, parseEmbeddedDeepMetrics } from "./adapters/rugbypass.js";
export { MatchCentreAdapter } from "./adapters/matchcentre.js";
export { PaidProviderAdapter, NotImplementedError } from "./adapters/paid-stub.js";

import type { DataSourceAdapter } from "./adapter.js";
import { RugbyPyAdapter } from "./adapters/rugbypy.js";
import { RugbyPassAdapter } from "./adapters/rugbypass.js";
import { MatchCentreAdapter } from "./adapters/matchcentre.js";
import { PaidProviderAdapter } from "./adapters/paid-stub.js";

/**
 * The production adapter roster, in merge order (box-score spine first). Live
 * scraping is off by default in this environment, so each falls back to its
 * recorded fixture — proving the fixture-fallback path end to end.
 */
export function defaultAdapters(): DataSourceAdapter[] {
  return [
    new RugbyPyAdapter(),
    new MatchCentreAdapter(),
    new RugbyPassAdapter(),
    new PaidProviderAdapter(),
  ];
}
