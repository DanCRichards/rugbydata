import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PositionCode } from "@ruckmetrics/contracts";
import {
  AdapterUnavailableError,
  BaseAdapter,
  MalformedSourceError,
  requireFinite,
  type FetchQuery,
  type RawContribution,
} from "../adapter.js";
import { DiskCache, cacheKey } from "../cache.js";

/**
 * OFFICIAL MATCH-CENTRE adapter, provenance `matchCentre`.
 *
 * Set-piece data from the official competition match centre:
 *   players (forwards): p_lineoutTakesPer80 (numerator + minutesPlayed),
 *                       p_oppLineoutsStolen
 *   teams:              t_scrumWinPctOwn, t_lineoutWinPctOwn
 *
 * Live mode would hit the official JSON endpoint (cached); tests use the fixture.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, "..", "..", "fixtures", "matchcentre", "set-piece.json");
const BASE_URL = "https://matchcentre.example/api/setpiece";

interface PlayerSetPieceRow {
  playerId: string;
  teamId: string;
  matchId: string;
  position: string;
  minutesPlayed: number;
  lineoutTakes: number;
  oppLineoutsStolen: number;
}

interface TeamSetPieceRow {
  teamId: string;
  matchId: string;
  scrumWinPctOwn: number;
  lineoutWinPctOwn: number;
}

interface SetPiecePayload {
  PLAYER_CLUB?: Record<string, Record<string, PlayerSetPieceRow[]>>;
  TEAM_TEST?: Record<string, Record<string, TeamSetPieceRow[]>>;
}

export interface MatchCentreAdapterOptions {
  cache?: DiskCache;
  /** Injected JSON fetcher (defaults to real fetch); tests never use it. */
  httpGetJson?: (url: string) => Promise<string>;
}

export class MatchCentreAdapter extends BaseAdapter {
  readonly source = "matchCentre" as const;
  readonly name = "Official Match Centre (set-piece)";

  private readonly cache: DiskCache;
  private readonly httpGetJson?: (url: string) => Promise<string>;

  constructor(opts: MatchCentreAdapterOptions = {}) {
    super();
    this.cache = opts.cache ?? new DiskCache();
    this.httpGetJson = opts.httpGetJson;
  }

  async probe(): Promise<void> {
    if (!this.httpGetJson) {
      throw new AdapterUnavailableError(
        this.source,
        "live endpoint disabled (no HTTP getter injected); using recorded fixtures",
      );
    }
  }

  async fetchLive(query: FetchQuery): Promise<RawContribution[]> {
    const getter = this.httpGetJson;
    if (!getter) throw new AdapterUnavailableError(this.source, "no HTTP getter");
    const url = `${BASE_URL}?comp=${query.competition}&season=${query.season}&scope=${query.scope}`;
    const key = cacheKey({ source: this.source, url });
    const raw = await this.cache.getOrSet(key, () => getter(url));
    return this.mapPayload(JSON.parse(raw) as SetPiecePayload, query);
  }

  async fetchFixture(query: FetchQuery): Promise<RawContribution[]> {
    const raw = await readFile(FIXTURE, "utf8");
    return this.mapPayload(JSON.parse(raw) as SetPiecePayload, query);
  }

  mapPayload(payload: SetPiecePayload, query: FetchQuery): RawContribution[] {
    if (query.scope === "PLAYER_CLUB") {
      const rows = payload.PLAYER_CLUB?.[query.competition]?.[query.season] ?? [];
      return rows.map((r) => this.mapPlayer(r, query));
    }
    const rows = payload.TEAM_TEST?.[query.competition]?.[query.season] ?? [];
    return rows.map((r) => this.mapTeam(r, query));
  }

  private mapPlayer(r: PlayerSetPieceRow, query: FetchQuery): RawContribution {
    if (!r.playerId || !r.matchId) {
      throw new MalformedSourceError(this.source, `player row missing id/matchId: ${JSON.stringify(r)}`);
    }
    const minutes = requireFinite(this.source, "minutesPlayed", r.minutesPlayed);
    return {
      entityKind: "PLAYER",
      subjectId: r.playerId,
      teamId: r.teamId,
      matchId: r.matchId,
      competition: query.competition,
      season: query.season,
      position: r.position as PositionCode,
      values: {
        // rate metric: numerator = lineout takes, denominator = minutesPlayed
        p_lineoutTakesPer80: requireFinite(this.source, "lineoutTakes", r.lineoutTakes),
        minutesPlayed: minutes,
        p_oppLineoutsStolen: requireFinite(this.source, "oppLineoutsStolen", r.oppLineoutsStolen),
      },
    };
  }

  private mapTeam(r: TeamSetPieceRow, query: FetchQuery): RawContribution {
    return {
      entityKind: "TEAM",
      subjectId: r.teamId,
      matchId: r.matchId,
      competition: query.competition,
      season: query.season,
      position: null,
      values: {
        t_scrumWinPctOwn: requireFinite(this.source, "scrumWinPctOwn", r.scrumWinPctOwn),
        t_lineoutWinPctOwn: requireFinite(this.source, "lineoutWinPctOwn", r.lineoutWinPctOwn),
      },
    };
  }
}
