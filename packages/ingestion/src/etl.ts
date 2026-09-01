import {
  MatchStatRecord,
  type Competition,
  type EntityKind,
  type Player,
  type PositionCode,
  type ProvenanceSource,
  type Team,
} from "@ruckmetrics/contracts";
import type { Repository } from "@ruckmetrics/store";
import type { DataSourceAdapter, FetchQuery, RawContribution } from "./adapter.js";
import { clamp, hashString, round } from "./prng.js";

/**
 * ETL ORCHESTRATION.
 *
 * runEtl: run every adapter for a query (each falling back to recorded fixtures
 * when its live source is unavailable), merge the per-source contributions into
 * validated MatchStatRecords, synthesize the DERIVE metrics, and upsert entities
 * + records into the store. Idempotent: record ids are deterministic so a re-run
 * replaces rather than duplicates.
 */

/**
 * Fixed base fetch timestamp. Determinism matters (seed + ETL must be
 * reproducible), so we never use Date.now(); provenance time is derived from a
 * constant base plus a per-source offset so the freshness rollup shows a spread.
 */
export const FETCHED_AT_BASE = "2025-06-01T12:00:00.000Z";

const SOURCE_OFFSET_HOURS: Record<ProvenanceSource, number> = {
  rugbypy: 0,
  matchCentre: 6,
  rugbypass: 12,
  derived: 18,
  paidProvider: 24,
};

export function fetchedAtFor(source: ProvenanceSource): string {
  const base = Date.parse(FETCHED_AT_BASE);
  return new Date(base + SOURCE_OFFSET_HOURS[source] * 3600_000).toISOString();
}

/** Deterministic, source-suffixed record id (keeps split-by-source rows unique). */
export function recordId(
  entityKind: EntityKind,
  subjectId: string,
  matchId: string,
  source: ProvenanceSource,
): string {
  return `${entityKind}:${subjectId}:${matchId}:${source}`;
}

/* --------------------------- DERIVE synthesis --------------------------- */

/**
 * p_workRate numerator = ruck involvements + tackle involvements for the match.
 * Returns null if either component is missing (never impute). minutesPlayed is
 * required by the per80 basis and returned alongside.
 */
export function deriveWorkRate(
  values: Record<string, number>,
): { p_workRate: number; minutesPlayed: number } | null {
  const ruck = values.p_ruckInvolvements;
  const tackle = values.p_tackleInvolvements;
  const minutes = values.minutesPlayed;
  if (![ruck, tackle, minutes].every((v) => Number.isFinite(v))) return null;
  return { p_workRate: ruck! + tackle!, minutesPlayed: minutes! };
}

/**
 * t_restartRetentionPct (DERIVE): a plausible own-restart retention synthesized
 * deterministically from the free set-piece signals plus a stable per-match
 * jitter. No randomness at query time — same inputs => same output.
 */
export function synthRestartRetention(matchKey: string, values: Record<string, number>): number | null {
  const scrum = values.t_scrumWinPctOwn;
  const lineout = values.t_lineoutWinPctOwn;
  if (![scrum, lineout].every((v) => Number.isFinite(v))) return null;
  const jitter = (hashString(`restart:${matchKey}`) % 1000) / 1000; // [0,1)
  const base = scrum! * 0.4 + lineout! * 0.6 - 6 + jitter * 8; // plausible band
  return round(clamp(base, 55, 99), 1);
}

/**
 * t_postContactMetresPerCarry (DERIVE, perCarry): synthesize the team's
 * post-contact metres NUMERATOR for the match from carries; `carries` (the
 * denominator) must already be present. Returns null if carries is absent.
 */
export function synthPostContactPerCarry(
  matchKey: string,
  values: Record<string, number>,
): { t_postContactMetresPerCarry: number; carries: number } | null {
  const carries = values.carries;
  if (!Number.isFinite(carries)) return null;
  const jitter = (hashString(`pcm:${matchKey}`) % 1000) / 1000; // [0,1)
  const perCarry = 1.1 + jitter * 1.3; // ~1.1–2.4 post-contact metres per carry
  return { t_postContactMetresPerCarry: round(carries! * perCarry, 1), carries: carries! };
}

/* ------------------------------- run ETL -------------------------------- */

export interface EtlSummary {
  query: FetchQuery;
  perSource: { source: ProvenanceSource; mode: string; contributions: number; records: number }[];
  teams: number;
  players: number;
  records: number;
}

export interface RunEtlOptions {
  repo: Repository;
  adapters: DataSourceAdapter[];
  log?: (msg: string) => void;
}

export async function runEtl(query: FetchQuery, opts: RunEtlOptions): Promise<EtlSummary> {
  const log = opts.log ?? (() => undefined);
  const perSource: EtlSummary["perSource"] = [];
  const records: MatchStatRecord[] = [];

  // Group contributions by subject+match so we can synthesize DERIVE metrics
  // from the union of all sources for that match.
  const byMatch = new Map<string, { entityKind: EntityKind; subjectId: string; matchId: string; position: PositionCode | null; merged: Record<string, number> }>();
  const teamIndex = new Map<string, Team>();
  const playerIndex = new Map<string, Player>();

  for (const adapter of opts.adapters) {
    const outcome = await adapter.fetch(query);
    let recCount = 0;
    for (const c of outcome.rows) {
      collectEntities(c, query, teamIndex, playerIndex);
      const rec = contributionToRecord(c, adapter.source);
      records.push(rec);
      recCount++;
      mergeForDerive(byMatch, c);
    }
    perSource.push({
      source: adapter.source,
      mode: outcome.mode,
      contributions: outcome.rows.length,
      records: recCount,
    });
    log(`  ${adapter.source}: ${outcome.mode} — ${outcome.rows.length} contributions`);
  }

  // Synthesize DERIVE records (source = "derived").
  for (const m of byMatch.values()) {
    const derivedValues = buildDerivedValues(m.entityKind, `${m.subjectId}:${m.matchId}`, m.merged);
    if (!derivedValues) continue;
    records.push(
      MatchStatRecord.parse({
        id: recordId(m.entityKind, m.subjectId, m.matchId, "derived"),
        entityKind: m.entityKind,
        subjectId: m.subjectId,
        matchId: m.matchId,
        competition: query.competition,
        season: query.season,
        position: m.position,
        values: derivedValues,
        provenance: { source: "derived", url: null, fetchedAt: fetchedAtFor("derived") },
      }),
    );
  }

  await opts.repo.upsertTeams([...teamIndex.values()]);
  await opts.repo.upsertPlayers([...playerIndex.values()]);
  await opts.repo.upsertRecords(records);

  return {
    query,
    perSource,
    teams: teamIndex.size,
    players: playerIndex.size,
    records: records.length,
  };
}

function contributionToRecord(c: RawContribution, source: ProvenanceSource): MatchStatRecord {
  return MatchStatRecord.parse({
    id: recordId(c.entityKind, c.subjectId, c.matchId, source),
    entityKind: c.entityKind,
    subjectId: c.subjectId,
    matchId: c.matchId,
    competition: c.competition,
    season: c.season,
    position: c.position ?? null,
    values: c.values,
    provenance: { source, url: null, fetchedAt: fetchedAtFor(source) },
  });
}

function mergeForDerive(
  byMatch: Map<string, { entityKind: EntityKind; subjectId: string; matchId: string; position: PositionCode | null; merged: Record<string, number> }>,
  c: RawContribution,
): void {
  const key = `${c.entityKind}:${c.subjectId}:${c.matchId}`;
  let entry = byMatch.get(key);
  if (!entry) {
    entry = {
      entityKind: c.entityKind,
      subjectId: c.subjectId,
      matchId: c.matchId,
      position: c.position ?? null,
      merged: {},
    };
    byMatch.set(key, entry);
  }
  for (const [k, v] of Object.entries(c.values)) entry.merged[k] = v;
  if (c.position && !entry.position) entry.position = c.position;
}

function buildDerivedValues(
  entityKind: EntityKind,
  matchKey: string,
  merged: Record<string, number>,
): Record<string, number> | null {
  if (entityKind === "PLAYER") {
    const wr = deriveWorkRate(merged);
    return wr ? { p_workRate: wr.p_workRate, minutesPlayed: wr.minutesPlayed } : null;
  }
  const out: Record<string, number> = {};
  const restart = synthRestartRetention(matchKey, merged);
  if (restart !== null) out.t_restartRetentionPct = restart;
  const pcm = synthPostContactPerCarry(matchKey, merged);
  if (pcm) {
    out.t_postContactMetresPerCarry = pcm.t_postContactMetresPerCarry;
    out.carries = pcm.carries;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Deterministic kit colour for a team slug (stable across runs/adapters). */
export function teamColourSlug(slug: string): string {
  const h = hashString(`colour:${slug}`);
  const hue = h % 360;
  // Keep the palette light-leaning and saturated so dark-mode dots stay visible.
  const sat = 55 + (h >> 8) % 25; // 55–80%
  const light = 40 + (h >> 4) % 20; // 40–60%
  return hslToHex(hue, sat, light);
}

/** Convert an HSL triple to a #RRGGBB string (clamped inputs). */
function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const lig = l / 100;
  const c = (1 - Math.abs(2 * lig - 1)) * sat;
  const hh = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  const [r1, g1, b1] =
    hh < 1 ? [c, x, 0] : hh < 2 ? [x, c, 0] : hh < 3 ? [0, c, x] : hh < 4 ? [0, x, c] : hh < 5 ? [x, 0, c] : [c, 0, x];
  const m = lig - c / 2;
  const toHex = (v: number): string =>
    Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r1)}${toHex(g1)}${toHex(b1)}`;
}

function collectEntities(
  c: RawContribution,
  query: FetchQuery,
  teamIndex: Map<string, Team>,
  playerIndex: Map<string, Player>,
): void {
  if (c.entityKind === "PLAYER") {
    const teamId = c.teamId ?? "unknown";
    if (!teamIndex.has(teamId)) {
      teamIndex.set(teamId, {
        id: teamId,
        name: deslug(teamId),
        competition: query.competition,
        isNational: isNationalCompetition(query.competition),
        colours: [teamColourSlug(teamId)],
      });
    }
    if (!playerIndex.has(c.subjectId) && c.position) {
      playerIndex.set(c.subjectId, {
        id: c.subjectId,
        name: playerNameFromId(c.subjectId, teamId),
        teamId,
        position: c.position,
      });
    }
  } else {
    if (!teamIndex.has(c.subjectId)) {
      teamIndex.set(c.subjectId, {
        id: c.subjectId,
        name: deslug(c.subjectId),
        competition: query.competition,
        isNational: isNationalCompetition(query.competition),
        colours: [teamColourSlug(c.subjectId)],
      });
    }
  }
}

export function isNationalCompetition(comp: Competition): boolean {
  return comp === "NATIONS_CHAMPIONSHIP" || comp === "TEST_MATCH";
}

/** "glasgow-warriors" -> "Glasgow Warriors". */
export function deslug(slug: string): string {
  return slug
    .split("-")
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** "leinster-caelan-doris-8" -> "Caelan Doris" (strip team prefix + shirt no). */
export function playerNameFromId(playerId: string, teamId: string): string {
  let rest = playerId.startsWith(`${teamId}-`) ? playerId.slice(teamId.length + 1) : playerId;
  rest = rest.replace(/-\d+$/, "");
  return deslug(rest);
}
