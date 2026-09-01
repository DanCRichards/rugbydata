/**
 * DuckDB schema. Raw metric values are held in a JSON column so the store schema
 * stays stable as the registry grows — a new metric is a new key in `values`,
 * never a migration. Provenance and fetch time are columns on every fact row so
 * data-freshness is queryable, not bolted on.
 *
 * fetched_at is stored as an ISO-8601 VARCHAR: it sorts lexicographically (so
 * MIN/MAX give oldest/newest) and round-trips without timezone ambiguity.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS teams (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  competition VARCHAR NOT NULL,
  is_national BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS players (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  team_id VARCHAR NOT NULL,
  position VARCHAR NOT NULL
);

CREATE TABLE IF NOT EXISTS match_stat_records (
  id VARCHAR PRIMARY KEY,
  entity_kind VARCHAR NOT NULL,
  subject_id VARCHAR NOT NULL,
  match_id VARCHAR NOT NULL,
  competition VARCHAR NOT NULL,
  season VARCHAR NOT NULL,
  position VARCHAR,
  values JSON NOT NULL,
  prov_source VARCHAR NOT NULL,
  prov_url VARCHAR,
  fetched_at VARCHAR NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_records_cohort
  ON match_stat_records (entity_kind, competition, season);
`;
