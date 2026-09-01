import {
  MatchStatRecord,
  POSITION_GROUP_BY_CODE,
  type CohortSubject,
  type Competition,
  type FreshnessEntry,
  type Player,
  type PositionCode,
  type PositionGroup,
  type ProvenanceSource,
  type Scope,
  type Season,
  type Team,
} from "@ruckmetrics/contracts";
import { Db } from "./db.js";
import { SCHEMA_SQL } from "./schema.js";

export interface CohortQuery {
  scope: Scope;
  competition: Competition;
  season: Season;
}

export interface CohortResult {
  subjects: CohortSubject[];
  records: MatchStatRecord[];
}

function entityKindForScope(scope: Scope): "PLAYER" | "TEAM" {
  return scope === "PLAYER_CLUB" ? "PLAYER" : "TEAM";
}

/**
 * The typed persistence boundary. Everything that touches the database goes
 * through here; ingestion writes, the API reads. Reads are re-validated against
 * the contract schema so a corrupt row fails loud rather than flowing onward.
 */
export class Repository {
  constructor(private readonly db: Db) {}

  static async open(path = ":memory:"): Promise<Repository> {
    const db = await Db.open(path);
    const repo = new Repository(db);
    await repo.migrate();
    return repo;
  }

  async migrate(): Promise<void> {
    await this.db.execScript(SCHEMA_SQL);
  }

  close(): void {
    this.db.close();
  }

  /* -------------------------------- writes -------------------------------- */

  async upsertTeams(teams: Team[]): Promise<void> {
    for (const t of teams) {
      await this.db.exec("INSERT OR REPLACE INTO teams VALUES ($1,$2,$3,$4,$5)", [
        t.id,
        t.name,
        t.competition,
        t.isNational,
        JSON.stringify(t.colours),
      ]);
    }
  }

  async upsertPlayers(players: Player[]): Promise<void> {
    for (const p of players) {
      await this.db.exec("INSERT OR REPLACE INTO players VALUES ($1,$2,$3,$4)", [
        p.id,
        p.name,
        p.teamId,
        p.position,
      ]);
    }
  }

  /** Idempotent by record id — re-running ETL replaces rather than duplicates. */
  async upsertRecords(records: MatchStatRecord[]): Promise<number> {
    for (const r of records) {
      const parsed = MatchStatRecord.parse(r); // validate at the write boundary
      await this.db.exec(
        `INSERT OR REPLACE INTO match_stat_records
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          parsed.id,
          parsed.entityKind,
          parsed.subjectId,
          parsed.matchId,
          parsed.competition,
          parsed.season,
          parsed.position,
          JSON.stringify(parsed.values),
          parsed.provenance.source,
          parsed.provenance.url,
          parsed.provenance.fetchedAt,
        ],
      );
    }
    return records.length;
  }

  /* -------------------------------- reads --------------------------------- */

  async getCohort(q: CohortQuery): Promise<CohortResult> {
    const entityKind = entityKindForScope(q.scope);
    const rows = await this.db.all<RawRecordRow>(
      `SELECT id, entity_kind, subject_id, match_id, competition, season, position,
              values, prov_source, prov_url, fetched_at
       FROM match_stat_records
       WHERE entity_kind = $1 AND competition = $2 AND season = $3`,
      [entityKind, q.competition, q.season],
    );
    const records = rows.map(rowToRecord);

    const [players, teams] = await Promise.all([this.allPlayers(), this.allTeams()]);
    const playerById = new Map(players.map((p) => [p.id, p]));
    const teamById = new Map(teams.map((t) => [t.id, t]));

    // Count DISTINCT matches per subject. Records may be split by provenance
    // source (one row per source per match), so a naive row count would
    // over-report; a subject's match count is the number of unique match ids.
    const matchesBySubject = new Map<string, Set<string>>();
    for (const r of records) {
      let set = matchesBySubject.get(r.subjectId);
      if (!set) {
        set = new Set();
        matchesBySubject.set(r.subjectId, set);
      }
      set.add(r.matchId);
    }

    const subjects: CohortSubject[] = [];
    for (const subjectId of matchesBySubject.keys()) {
      if (entityKind === "PLAYER") {
        const p = playerById.get(subjectId);
        const position = (p?.position ?? null) as PositionCode | null;
        const positionGroup: PositionGroup | null = position
          ? POSITION_GROUP_BY_CODE[position]
          : null;
        subjects.push({
          subjectId,
          label: p?.name ?? subjectId,
          teamId: p?.teamId ?? "",
          position,
          positionGroup,
          matchCount: matchesBySubject.get(subjectId)!.size,
          colours: teamById.get(p?.teamId ?? "")?.colours ?? ["#000000"],
        });
      } else {
        const t = teamById.get(subjectId);
        subjects.push({
          subjectId,
          label: t?.name ?? subjectId,
          teamId: subjectId,
          position: null,
          positionGroup: null,
          matchCount: matchesBySubject.get(subjectId)!.size,
          colours: t?.colours ?? ["#000000"],
        });
      }
    }
    subjects.sort((a, b) => a.label.localeCompare(b.label));
    return { subjects, records };
  }

  async allPlayers(): Promise<Player[]> {
    const rows = await this.db.all<{ id: string; name: string; team_id: string; position: string }>(
      "SELECT id, name, team_id, position FROM players",
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      teamId: r.team_id,
      position: r.position as PositionCode,
    }));
  }

  async allTeams(): Promise<Team[]> {
    const rows = await this.db.all<{
      id: string;
      name: string;
      competition: string;
      is_national: boolean;
      colours: string | null;
    }>("SELECT id, name, competition, is_national, colours FROM teams");
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      competition: r.competition as Competition,
      isNational: Boolean(r.is_national),
      colours: r.colours ? JSON.parse(r.colours) : ["#6b6a65"],
    }));
  }

  /** Data-freshness rollup by provenance source and scope. */
  async freshness(): Promise<FreshnessEntry[]> {
    const rows = await this.db.all<{
      prov_source: string;
      entity_kind: string;
      row_count: number;
      newest: string | null;
      oldest: string | null;
    }>(
      `SELECT prov_source, entity_kind,
              COUNT(*) AS row_count,
              MAX(fetched_at) AS newest,
              MIN(fetched_at) AS oldest
       FROM match_stat_records
       GROUP BY prov_source, entity_kind
       ORDER BY prov_source, entity_kind`,
    );
    return rows.map((r) => ({
      source: r.prov_source as ProvenanceSource,
      scope: (r.entity_kind === "PLAYER" ? "PLAYER_CLUB" : "TEAM_TEST") as Scope,
      rowCount: r.row_count,
      newestFetchedAt: r.newest,
      oldestFetchedAt: r.oldest,
    }));
  }
}

interface RawRecordRow {
  id: string;
  entity_kind: string;
  subject_id: string;
  match_id: string;
  competition: string;
  season: string;
  position: string | null;
  values: string;
  prov_source: string;
  prov_url: string | null;
  fetched_at: string;
}

function rowToRecord(r: RawRecordRow): MatchStatRecord {
  return MatchStatRecord.parse({
    id: r.id,
    entityKind: r.entity_kind,
    subjectId: r.subject_id,
    matchId: r.match_id,
    competition: r.competition,
    season: r.season,
    position: r.position,
    values: JSON.parse(r.values),
    provenance: {
      source: r.prov_source,
      url: r.prov_url,
      fetchedAt: r.fetched_at,
    },
  });
}
