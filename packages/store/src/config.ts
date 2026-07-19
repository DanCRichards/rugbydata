import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Single source of truth for where the DuckDB database lives, so ingestion (which
 * writes) and the API (which reads) always agree. Override with RUCKMETRICS_DB.
 *
 * The default resolves to <repo-root>/data/ruckmetrics.duckdb based on this
 * file's own location — NOT process.cwd() — so it is stable no matter which
 * package or workspace script invokes it (npm run -w changes the cwd).
 */
const HERE = dirname(fileURLToPath(import.meta.url)); // packages/store/src
const REPO_ROOT = resolve(HERE, "..", "..", ".."); // -> repo root

export function databasePath(): string {
  const fromEnv = process.env.RUCKMETRICS_DB;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();
  return resolve(REPO_ROOT, "data", "ruckmetrics.duckdb");
}
