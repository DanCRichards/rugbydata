import { spawn } from "node:child_process";
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
 * BOX-SCORE SPINE adapter, provenance `rugbypy`.
 *
 * Live mode wraps the Python `rugbypy` library by spawning `python3` as a
 * subprocess and reading a JSON dump from stdout (cached to disk). Because
 * rugbypy / python may not be installed here, {@link probe} runs a one-shot
 * `import rugbypy` check and throws {@link AdapterUnavailableError} if it fails,
 * which the ETL turns into a recorded-fixture fallback.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, "..", "..", "fixtures", "rugbypy", "box-scores.json");

interface PlayerBoxRow {
  playerId: string;
  teamId: string;
  matchId: string;
  position: string;
  minutesPlayed: number;
  tackles: number;
  tackleInvolvements: number;
  defendersBeaten: number;
  turnoversWon: number;
  penaltiesConceded: number;
  tryAssists: number;
  triesScored: number;
  metresCarried: number;
  cleanBreaks: number;
  kickVolume?: number;
}

interface TeamBoxRow {
  teamId: string;
  matchId: string;
  minutesPlayed: number;
  turnoversWon: number;
  penaltiesConceded: number;
  tacklesMade: number;
  tackleCompletionPct: number;
  turnoversLost: number;
  teamRucks: number;
  carries: number;
}

type FixtureShape = {
  PLAYER_CLUB?: Record<string, Record<string, PlayerBoxRow[]>>;
  TEAM_TEST?: Record<string, Record<string, TeamBoxRow[]>>;
};

export class RugbyPyAdapter extends BaseAdapter {
  readonly source = "rugbypy" as const;
  readonly name = "rugbypy (box-score spine)";

  private probed: boolean | null = null;

  constructor(private readonly cache: DiskCache = new DiskCache()) {
    super();
  }

  /** One-shot `import rugbypy` probe; cached for the process lifetime. */
  async probe(): Promise<void> {
    if (this.probed === true) return;
    if (this.probed === false) {
      throw new AdapterUnavailableError(this.source, "python3/rugbypy not importable");
    }
    const ok = await pythonCanImportRugbypy();
    this.probed = ok;
    if (!ok) {
      throw new AdapterUnavailableError(
        this.source,
        "python3 with the 'rugbypy' package is not installed in this environment",
      );
    }
  }

  async fetchLive(query: FetchQuery): Promise<RawContribution[]> {
    // Route the subprocess output through the disk cache so re-runs are
    // idempotent and the raw payload is auditable.
    const key = cacheKey({
      source: this.source,
      url: "python3:rugbypy",
      params: { scope: query.scope, competition: query.competition, season: query.season },
    });
    const raw = await this.cache.getOrSet(key, () => runRugbypy(query));
    const parsed = JSON.parse(raw) as FixtureShape;
    return this.mapPayload(parsed, query);
  }

  async fetchFixture(query: FetchQuery): Promise<RawContribution[]> {
    const raw = await readFile(FIXTURE, "utf8");
    const parsed = JSON.parse(raw) as FixtureShape;
    return this.mapPayload(parsed, query);
  }

  /** Pure parser: fixture/live payload -> contributions. Unit-tested directly. */
  mapPayload(payload: FixtureShape, query: FetchQuery): RawContribution[] {
    if (query.scope === "PLAYER_CLUB") {
      const rows = payload.PLAYER_CLUB?.[query.competition]?.[query.season] ?? [];
      return rows.map((r) => this.mapPlayer(r, query));
    }
    const rows = payload.TEAM_TEST?.[query.competition]?.[query.season] ?? [];
    return rows.map((r) => this.mapTeam(r, query));
  }

  private mapPlayer(r: PlayerBoxRow, query: FetchQuery): RawContribution {
    if (!r.playerId || !r.matchId) {
      throw new MalformedSourceError(this.source, `player row missing id/matchId: ${JSON.stringify(r)}`);
    }
    const minutes = requireFinite(this.source, "minutesPlayed", r.minutesPlayed);
    const tackles = requireFinite(this.source, "tackles", r.tackles);
    const values: Record<string, number> = {
      p_defendersBeaten: requireFinite(this.source, "defendersBeaten", r.defendersBeaten),
      p_turnoversWon: requireFinite(this.source, "turnoversWon", r.turnoversWon),
      p_penaltiesConceded: requireFinite(this.source, "penaltiesConceded", r.penaltiesConceded),
      p_tackleInvolvements: requireFinite(this.source, "tackleInvolvements", r.tackleInvolvements),
      p_tryAssists: requireFinite(this.source, "tryAssists", r.tryAssists),
      p_triesScored: requireFinite(this.source, "triesScored", r.triesScored),
      p_metresCarried: requireFinite(this.source, "metresCarried", r.metresCarried),
      p_cleanBreaks: requireFinite(this.source, "cleanBreaks", r.cleanBreaks),
      p_tacklesMade: tackles,
      // rate metric: numerator = tackles, denominator = minutesPlayed (same record)
      p_tacklesPer80: tackles,
      minutesPlayed: minutes,
    };
    // kickVolume is optional (mainly halves) — omit when absent rather than impute.
    if (r.kickVolume !== undefined && r.kickVolume !== null) {
      values.p_kickVolume = requireFinite(this.source, "kickVolume", r.kickVolume);
    }
    return {
      entityKind: "PLAYER",
      subjectId: r.playerId,
      teamId: r.teamId,
      matchId: r.matchId,
      competition: query.competition,
      season: query.season,
      position: r.position as PositionCode,
      values,
    };
  }

  private mapTeam(r: TeamBoxRow, query: FetchQuery): RawContribution {
    if (!r.teamId || !r.matchId) {
      throw new MalformedSourceError(this.source, `team row missing id/matchId: ${JSON.stringify(r)}`);
    }
    const values: Record<string, number> = {
      t_turnoversWon: requireFinite(this.source, "turnoversWon", r.turnoversWon),
      t_penaltiesConceded: requireFinite(this.source, "penaltiesConceded", r.penaltiesConceded),
      t_tacklesMade: requireFinite(this.source, "tacklesMade", r.tacklesMade),
      t_tackleCompletionPct: requireFinite(this.source, "tackleCompletionPct", r.tackleCompletionPct),
      t_turnoversLost: requireFinite(this.source, "turnoversLost", r.turnoversLost),
      // reserved denominators carried on the box-score record
      teamRucks: requireFinite(this.source, "teamRucks", r.teamRucks),
      carries: requireFinite(this.source, "carries", r.carries),
      minutesPlayed: requireFinite(this.source, "minutesPlayed", r.minutesPlayed),
    };
    return {
      entityKind: "TEAM",
      subjectId: r.teamId,
      matchId: r.matchId,
      competition: query.competition,
      season: query.season,
      position: null,
      values,
    };
  }
}

/** Probe: `python3 -c "import rugbypy"`. Resolves true only on exit code 0. */
function pythonCanImportRugbypy(): Promise<boolean> {
  return new Promise((resolvePromise) => {
    let child;
    try {
      child = spawn("python3", ["-c", "import rugbypy"], { stdio: "ignore" });
    } catch {
      resolvePromise(false);
      return;
    }
    child.on("error", () => resolvePromise(false));
    child.on("close", (code) => resolvePromise(code === 0));
  });
}

/**
 * Live extraction. Spawns python to dump rugbypy box scores as JSON to stdout.
 * Only reached when {@link pythonCanImportRugbypy} succeeded. The python side is
 * expected to print the same {@link FixtureShape} JSON structure.
 */
function runRugbypy(query: FetchQuery): Promise<string> {
  const script = [
    "import json, sys",
    "import rugbypy",
    // A real integration would call rugbypy's fixtures/box-score APIs here and
    // shape them into the {PLAYER_CLUB|TEAM_TEST: {comp: {season: [...]}}} form.
    "scope, comp, season = sys.argv[1], sys.argv[2], sys.argv[3]",
    "payload = rugbypy.box_scores(competition=comp, season=season, scope=scope)",
    "json.dump(payload, sys.stdout)",
  ].join("\n");
  return new Promise((resolvePromise, reject) => {
    const child = spawn("python3", ["-c", script, query.scope, query.competition, query.season]);
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += String(d)));
    child.stderr.on("data", (d) => (err += String(d)));
    child.on("error", (e) => reject(new AdapterUnavailableError("rugbypy", e.message)));
    child.on("close", (code) => {
      if (code === 0) resolvePromise(out);
      else reject(new MalformedSourceError("rugbypy", `python exited ${code}: ${err}`));
    });
  });
}
