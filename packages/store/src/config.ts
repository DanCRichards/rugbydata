import { resolve } from "node:path";

/**
 * Single source of truth for where the DuckDB database lives, so ingestion (which
 * writes) and the API (which reads) always agree. Override with RUCKMETRICS_DB.
 */
export function databasePath(): string {
  const fromEnv = process.env.RUCKMETRICS_DB;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();
  // Repo-root ./data/ruckmetrics.duckdb regardless of which package invokes it.
  return resolve(process.cwd(), "data", "ruckmetrics.duckdb");
}
