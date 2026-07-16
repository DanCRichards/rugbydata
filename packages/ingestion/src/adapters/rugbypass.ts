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
import { RateLimiter } from "../rate-limiter.js";

/**
 * RUGBYPASS DEEP-METRICS adapter, provenance `rugbypass`.
 *
 * RugbyPass renders its stat tables client-side from a JSON blob embedded in the
 * page (a Next.js `__NEXT_DATA__` script tag). This adapter fetches the HTML
 * (rate-limited + cached), extracts that embedded JSON with a real best-effort
 * parser, and maps the deep metrics that only RugbyPass exposes:
 *   players: p_postContactMetres, p_dominantTacklePct, p_ruckArrivalEffect,
 *            p_ruckInvolvements
 *   teams:   t_dominantTackles
 *
 * Tests run entirely against the recorded fixture HTML — no network.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(HERE, "..", "..", "fixtures", "rugbypass", "match-page.html");
const BASE_URL = "https://www.rugbypass.com/match-centre";

interface PlayerDeepRow {
  playerId: string;
  teamId: string;
  matchId: string;
  position: string;
  postContactMetres: number;
  dominantTacklePct: number;
  ruckArrivalEffect?: number;
  ruckInvolvements: number;
}

interface TeamDeepRow {
  teamId: string;
  matchId: string;
  dominantTackles: number;
}

interface DeepMetricsPayload {
  PLAYER_CLUB?: Record<string, Record<string, PlayerDeepRow[]>>;
  TEAM_TEST?: Record<string, Record<string, TeamDeepRow[]>>;
}

export interface RugbyPassAdapterOptions {
  cache?: DiskCache;
  limiter?: RateLimiter;
  /** Injected HTML fetcher (defaults to real fetch); tests never use it. */
  httpGet?: (url: string) => Promise<string>;
}

export class RugbyPassAdapter extends BaseAdapter {
  readonly source = "rugbypass" as const;
  readonly name = "RugbyPass (deep metrics)";

  private readonly cache: DiskCache;
  private readonly limiter: RateLimiter;
  private readonly httpGet: (url: string) => Promise<string>;

  constructor(opts: RugbyPassAdapterOptions = {}) {
    super();
    this.cache = opts.cache ?? new DiskCache();
    // Polite defaults: 1 req/s, small burst, 500ms hard floor between requests.
    this.limiter = opts.limiter ?? new RateLimiter({ ratePerSecond: 1, burst: 2, minIntervalMs: 500 });
    this.httpGet = opts.httpGet ?? defaultHttpGet;
  }

  /**
   * Live scraping is only "available" when a real HTTP getter is wired in. In
   * this environment tests/ETL rely on the fixture, so we advertise unavailable
   * unless an httpGet was explicitly injected.
   */
  async probe(): Promise<void> {
    if (this.httpGet === defaultHttpGet) {
      throw new AdapterUnavailableError(
        this.source,
        "live scraping disabled (no HTTP getter injected); using recorded fixtures",
      );
    }
  }

  async fetchLive(query: FetchQuery): Promise<RawContribution[]> {
    const url = `${BASE_URL}?comp=${query.competition}&season=${query.season}&scope=${query.scope}`;
    const key = cacheKey({ source: this.source, url });
    const html = await this.cache.getOrSet(key, async () => {
      await this.limiter.acquire();
      return this.httpGet(url);
    });
    const payload = parseEmbeddedDeepMetrics(html);
    return this.mapPayload(payload, query);
  }

  async fetchFixture(query: FetchQuery): Promise<RawContribution[]> {
    const html = await readFile(FIXTURE, "utf8");
    const payload = parseEmbeddedDeepMetrics(html);
    return this.mapPayload(payload, query);
  }

  mapPayload(payload: DeepMetricsPayload, query: FetchQuery): RawContribution[] {
    if (query.scope === "PLAYER_CLUB") {
      const rows = payload.PLAYER_CLUB?.[query.competition]?.[query.season] ?? [];
      return rows.map((r) => this.mapPlayer(r, query));
    }
    const rows = payload.TEAM_TEST?.[query.competition]?.[query.season] ?? [];
    return rows.map((r) => this.mapTeam(r, query));
  }

  private mapPlayer(r: PlayerDeepRow, query: FetchQuery): RawContribution {
    const values: Record<string, number> = {
      p_postContactMetres: requireFinite(this.source, "postContactMetres", r.postContactMetres),
      p_dominantTacklePct: requireFinite(this.source, "dominantTacklePct", r.dominantTacklePct),
      p_ruckInvolvements: requireFinite(this.source, "ruckInvolvements", r.ruckInvolvements),
    };
    // ruckArrivalEffect only meaningful for locks/loose forwards; absent => omit.
    if (r.ruckArrivalEffect !== undefined && r.ruckArrivalEffect !== null) {
      values.p_ruckArrivalEffect = requireFinite(this.source, "ruckArrivalEffect", r.ruckArrivalEffect);
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

  private mapTeam(r: TeamDeepRow, query: FetchQuery): RawContribution {
    return {
      entityKind: "TEAM",
      subjectId: r.teamId,
      matchId: r.matchId,
      competition: query.competition,
      season: query.season,
      position: null,
      values: {
        t_dominantTackles: requireFinite(this.source, "dominantTackles", r.dominantTackles),
      },
    };
  }
}

/**
 * Extract the embedded deep-metrics payload from a RugbyPass HTML page.
 *
 * Strategy (best effort, in order):
 *   1. The Next.js `<script id="__NEXT_DATA__" type="application/json">` tag,
 *      reading `props.pageProps.deepMetrics`.
 *   2. Any `<script type="application/json">` whose JSON contains a
 *      `deepMetrics` key (defensive against markup changes).
 *
 * Throws {@link MalformedSourceError} if no embedded JSON can be found or parsed
 * — we never fabricate data from an unrecognised page.
 */
export function parseEmbeddedDeepMetrics(html: string): DeepMetricsPayload {
  const source = "rugbypass" as const;

  const nextData = extractScriptById(html, "__NEXT_DATA__");
  const candidates: string[] = [];
  if (nextData) candidates.push(nextData);
  candidates.push(...extractJsonScripts(html));

  for (const raw of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const deep = findDeepMetrics(parsed);
    if (deep) return deep;
  }
  throw new MalformedSourceError(source, "no embedded deepMetrics JSON found in page");
}

/** Pull the inner text of a <script id="..."> tag. */
function extractScriptById(html: string, id: string): string | null {
  const re = new RegExp(
    `<script[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)</script>`,
    "i",
  );
  const m = re.exec(html);
  return m && m[1] ? m[1].trim() : null;
}

/** All <script type="application/json"> bodies. */
function extractJsonScripts(html: string): string[] {
  const re = /<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1]) out.push(m[1].trim());
  }
  return out;
}

/** Locate a `deepMetrics` object anywhere in a parsed JSON tree. */
function findDeepMetrics(root: unknown): DeepMetricsPayload | null {
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === null || typeof node !== "object") continue;
    const obj = node as Record<string, unknown>;
    if ("deepMetrics" in obj && obj.deepMetrics && typeof obj.deepMetrics === "object") {
      return obj.deepMetrics as DeepMetricsPayload;
    }
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return null;
}

async function defaultHttpGet(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "user-agent": "RuckMetrics/0.1 (+ingestion)" } });
  if (!res.ok) throw new AdapterUnavailableError("rugbypass", `HTTP ${res.status} for ${url}`);
  return res.text();
}
