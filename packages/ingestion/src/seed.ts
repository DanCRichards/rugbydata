import {
  MatchStatRecord,
  POSITION_GROUP_BY_CODE,
  type Competition,
  type Player,
  type PositionCode,
  type PositionGroup,
  type ProvenanceSource,
  type Season,
  type Team,
} from "@ruckmetrics/contracts";
import type { Repository } from "@ruckmetrics/store";
import {
  fetchedAtFor,
  recordId,
  synthPostContactPerCarry,
  synthRestartRetention,
} from "./etl.js";
import { Rng, clamp, round } from "./prng.js";

/**
 * DETERMINISTIC SEED GENERATOR.
 *
 * Synthesizes the full demo dataset directly (no network, no adapters) so the
 * whole app renders from free-data presets. Everything is driven by a seeded
 * PRNG keyed off stable slugs, so the same seed yields byte-identical ids and
 * values every run (verified by the determinism test).
 *
 * Records are split by provenance source (rugbypy box-score, rugbypass deep,
 * matchCentre set-piece, derived), with source-suffixed ids so each source's
 * freshness and per-metric aggregation stay clean.
 */

export const DEFAULT_SEED = 0x5ec0ffee;

const URC_TEAMS: string[] = [
  "leinster",
  "munster",
  "ulster",
  "connacht",
  "glasgow-warriors",
  "edinburgh",
  "cardiff",
  "ospreys",
  "scarlets",
  "stormers",
  "bulls",
  "sharks",
];
const SUPER_RUGBY_TEAMS: string[] = ["crusaders", "blues"];
const NATIONS_TEAMS: string[] = [
  "ireland",
  "france",
  "england",
  "scotland",
  "wales",
  "south-africa",
  "new-zealand",
  "australia",
  "argentina",
  "italy",
];

const CLUB_COMP: Competition = "URC";
const CLUB_SEASON: Season = "2024-25";
const SR_COMP: Competition = "SUPER_RUGBY";
const SR_SEASON: Season = "2024-25";
const TEST_COMP: Competition = "NATIONS_CHAMPIONSHIP";
const TEST_SEASON: Season = "2025";

const FIRST_NAMES = [
  "James", "Owen", "Finn", "Jack", "Tom", "Rhys", "Dan", "Sam", "Alex", "Josh",
  "Luke", "Ben", "Cian", "Conor", "Liam", "Kyle", "Marcus", "Elliot", "Harry", "George",
  "Pieter", "Andre", "Jaco", "Malik", "Ardie", "Beauden", "Caleb", "Tevita", "Sione", "Nic",
];
const LAST_NAMES = [
  "Murray", "Roberts", "Evans", "Kelleher", "Doris", "Ringrose", "Lowe", "Baird", "Sheehan", "Prendergast",
  "van der Merwe", "du Toit", "Kolbe", "Etzebeth", "Smith", "Barrett", "Savea", "Fainga'a", "Tuipulotu", "Williams",
  "Faletau", "Watson", "Ritchie", "Gray", "Price", "Russell", "Hastings", "Kinghorn", "Graham", "Dempsey",
];

const EXTRA_SHIRT_POSITION: Record<number, PositionCode> = {
  16: "2",
  17: "1",
  18: "3",
  19: "5",
  20: "7",
  21: "9",
  22: "12",
  23: "11",
};

function shirtToPosition(shirt: number): PositionCode {
  if (shirt >= 1 && shirt <= 15) return String(shirt) as PositionCode;
  const p = EXTRA_SHIRT_POSITION[shirt];
  if (!p) throw new Error(`no position mapping for shirt ${shirt}`);
  return p;
}

export interface SeedDataset {
  teams: Team[];
  players: Player[];
  records: MatchStatRecord[];
}

/* ------------------------------ value draws ----------------------------- */

function drawCount(rng: Rng, mean: number): number {
  return Math.max(0, Math.round(rng.normal(mean, mean * 0.4 + 0.3)));
}
function drawMetres(rng: Rng, mean: number): number {
  return Math.max(0, Math.round(rng.normal(mean, mean * 0.35 + 1)));
}
function drawPct(rng: Rng, mean: number, sd = 6): number {
  return clamp(round(rng.normal(mean, sd), 1), 0, 100);
}

interface PlayerProfile {
  tackles: number;
  metres: number;
  postContact: number;
  dominantTacklePct: number;
  turnoversWon: number;
  penalties: number;
  defendersBeaten: number;
  cleanBreaks: number;
  ruckInvolvements: number;
  ruckArrivalEffect: number;
  lineoutTakes: number;
  oppLineoutsStolen: number;
  tryAssists: number;
  tries: number;
  kickVolume: number;
}

const PROFILES: Record<PositionGroup, PlayerProfile> = {
  frontRow: { tackles: 12, metres: 14, postContact: 10, dominantTacklePct: 28, turnoversWon: 0.6, penalties: 1.2, defendersBeaten: 0.8, cleanBreaks: 0.2, ruckInvolvements: 18, ruckArrivalEffect: 65, lineoutTakes: 1, oppLineoutsStolen: 0.3, tryAssists: 0.1, tries: 0.15, kickVolume: 0 },
  locks: { tackles: 13, metres: 12, postContact: 9, dominantTacklePct: 30, turnoversWon: 1.0, penalties: 1.1, defendersBeaten: 0.6, cleanBreaks: 0.2, ruckInvolvements: 20, ruckArrivalEffect: 73, lineoutTakes: 5, oppLineoutsStolen: 0.9, tryAssists: 0.1, tries: 0.15, kickVolume: 0 },
  looseForwards: { tackles: 14, metres: 25, postContact: 14, dominantTacklePct: 33, turnoversWon: 1.8, penalties: 1.2, defendersBeaten: 2.0, cleanBreaks: 0.6, ruckInvolvements: 24, ruckArrivalEffect: 78, lineoutTakes: 2, oppLineoutsStolen: 0.6, tryAssists: 0.3, tries: 0.3, kickVolume: 0 },
  scrumHalf: { tackles: 8, metres: 20, postContact: 6, dominantTacklePct: 15, turnoversWon: 0.4, penalties: 0.9, defendersBeaten: 1.5, cleanBreaks: 0.5, ruckInvolvements: 30, ruckArrivalEffect: 60, lineoutTakes: 0, oppLineoutsStolen: 0, tryAssists: 0.8, tries: 0.25, kickVolume: 14 },
  flyHalf: { tackles: 9, metres: 18, postContact: 5, dominantTacklePct: 12, turnoversWon: 0.4, penalties: 0.9, defendersBeaten: 1.2, cleanBreaks: 0.4, ruckInvolvements: 10, ruckArrivalEffect: 55, lineoutTakes: 0, oppLineoutsStolen: 0, tryAssists: 1.0, tries: 0.2, kickVolume: 20 },
  centres: { tackles: 12, metres: 40, postContact: 18, dominantTacklePct: 25, turnoversWon: 0.6, penalties: 0.9, defendersBeaten: 2.5, cleanBreaks: 0.8, ruckInvolvements: 9, ruckArrivalEffect: 55, lineoutTakes: 0, oppLineoutsStolen: 0, tryAssists: 0.6, tries: 0.35, kickVolume: 2 },
  backThree: { tackles: 7, metres: 70, postContact: 16, dominantTacklePct: 18, turnoversWon: 0.5, penalties: 0.7, defendersBeaten: 3.2, cleanBreaks: 1.4, ruckInvolvements: 6, ruckArrivalEffect: 50, lineoutTakes: 0, oppLineoutsStolen: 0, tryAssists: 0.5, tries: 0.6, kickVolume: 5 },
};

const FORWARD_GROUPS: PositionGroup[] = ["frontRow", "locks", "looseForwards"];
function isForward(g: PositionGroup): boolean {
  return FORWARD_GROUPS.includes(g);
}

/* --------------------------- record assembly ---------------------------- */

function pushRecord(
  out: MatchStatRecord[],
  args: {
    entityKind: "PLAYER" | "TEAM";
    subjectId: string;
    matchId: string;
    competition: Competition;
    season: Season;
    position: PositionCode | null;
    source: ProvenanceSource;
    values: Record<string, number>;
  },
): void {
  out.push(
    MatchStatRecord.parse({
      id: recordId(args.entityKind, args.subjectId, args.matchId, args.source),
      entityKind: args.entityKind,
      subjectId: args.subjectId,
      matchId: args.matchId,
      competition: args.competition,
      season: args.season,
      position: args.position,
      values: args.values,
      provenance: { source: args.source, url: null, fetchedAt: fetchedAtFor(args.source) },
    }),
  );
}

function buildPlayerMatch(
  out: MatchStatRecord[],
  rng: Rng,
  player: Player,
  group: PositionGroup,
  talent: number,
  competition: Competition,
  season: Season,
  matchId: string,
): void {
  const p = PROFILES[group];
  const minutes = rng.int(55, 80);
  const t = talent;

  const tackles = drawCount(rng, p.tackles * t);
  const tackleInvolvements = tackles + drawCount(rng, 2);
  const ruckInvolvements = drawCount(rng, p.ruckInvolvements * t);

  // rugbypy box-score record (numerators + minutesPlayed denominator).
  const rugbypyValues: Record<string, number> = {
    p_tacklesMade: tackles,
    p_tacklesPer80: tackles,
    p_tackleInvolvements: tackleInvolvements,
    p_defendersBeaten: drawCount(rng, p.defendersBeaten * t),
    p_turnoversWon: drawCount(rng, p.turnoversWon * t),
    p_penaltiesConceded: drawCount(rng, p.penalties),
    p_tryAssists: drawCount(rng, p.tryAssists * t),
    p_triesScored: drawCount(rng, p.tries * t),
    p_metresCarried: drawMetres(rng, p.metres * t),
    p_cleanBreaks: drawCount(rng, p.cleanBreaks * t),
    minutesPlayed: minutes,
  };
  if (p.kickVolume > 0) rugbypyValues.p_kickVolume = drawCount(rng, p.kickVolume * t);
  pushRecord(out, { entityKind: "PLAYER", subjectId: player.id, matchId, competition, season, position: player.position, source: "rugbypy", values: rugbypyValues });

  // rugbypass deep-metrics record.
  const rugbypassValues: Record<string, number> = {
    p_postContactMetres: drawMetres(rng, p.postContact * t),
    p_dominantTacklePct: drawPct(rng, p.dominantTacklePct),
    p_ruckInvolvements: ruckInvolvements,
  };
  if (group === "locks" || group === "looseForwards") {
    rugbypassValues.p_ruckArrivalEffect = drawPct(rng, p.ruckArrivalEffect, 8);
  }
  pushRecord(out, { entityKind: "PLAYER", subjectId: player.id, matchId, competition, season, position: player.position, source: "rugbypass", values: rugbypassValues });

  // matchCentre set-piece record (forwards only).
  if (isForward(group)) {
    pushRecord(out, {
      entityKind: "PLAYER",
      subjectId: player.id,
      matchId,
      competition,
      season,
      position: player.position,
      source: "matchCentre",
      values: {
        p_lineoutTakesPer80: drawCount(rng, p.lineoutTakes * t),
        minutesPlayed: minutes,
        p_oppLineoutsStolen: drawCount(rng, p.oppLineoutsStolen * t),
      },
    });
  }

  // derived record: work-rate numerator + minutesPlayed.
  pushRecord(out, {
    entityKind: "PLAYER",
    subjectId: player.id,
    matchId,
    competition,
    season,
    position: player.position,
    source: "derived",
    values: { p_workRate: ruckInvolvements + tackleInvolvements, minutesPlayed: minutes },
  });
}

function buildTeamMatch(
  out: MatchStatRecord[],
  rng: Rng,
  teamId: string,
  talent: number,
  competition: Competition,
  season: Season,
  matchId: string,
): void {
  const t = talent;
  const carries = drawCount(rng, 110 * t);
  const teamRucks = drawCount(rng, 90 * t);
  const scrum = drawPct(rng, 93, 5);
  const lineout = drawPct(rng, 89, 6);

  // rugbypy team box-score record.
  pushRecord(out, {
    entityKind: "TEAM",
    subjectId: teamId,
    matchId,
    competition,
    season,
    position: null,
    source: "rugbypy",
    values: {
      t_turnoversWon: drawCount(rng, 9 * t),
      t_penaltiesConceded: drawCount(rng, 9),
      t_tacklesMade: drawCount(rng, 160 * t),
      t_tackleCompletionPct: drawPct(rng, 87, 3),
      t_turnoversLost: drawCount(rng, 13),
      teamRucks,
      carries,
      minutesPlayed: 80,
    },
  });

  // rugbypass deep record.
  pushRecord(out, {
    entityKind: "TEAM",
    subjectId: teamId,
    matchId,
    competition,
    season,
    position: null,
    source: "rugbypass",
    values: { t_dominantTackles: drawCount(rng, 28 * t) },
  });

  // matchCentre set-piece record.
  pushRecord(out, {
    entityKind: "TEAM",
    subjectId: teamId,
    matchId,
    competition,
    season,
    position: null,
    source: "matchCentre",
    values: { t_scrumWinPctOwn: scrum, t_lineoutWinPctOwn: lineout },
  });

  // derived record: restart retention + post-contact-per-carry numerator/carries.
  const matchKey = `${teamId}:${matchId}`;
  const mergedForDerive = { t_scrumWinPctOwn: scrum, t_lineoutWinPctOwn: lineout, carries };
  const restart = synthRestartRetention(matchKey, mergedForDerive);
  const pcm = synthPostContactPerCarry(matchKey, mergedForDerive);
  const derived: Record<string, number> = {};
  if (restart !== null) derived.t_restartRetentionPct = restart;
  if (pcm) {
    derived.t_postContactMetresPerCarry = pcm.t_postContactMetresPerCarry;
    derived.carries = pcm.carries;
  }
  pushRecord(out, {
    entityKind: "TEAM",
    subjectId: teamId,
    matchId,
    competition,
    season,
    position: null,
    source: "derived",
    values: derived,
  });
}

function buildSquad(
  ds: SeedDataset,
  rootSeed: number,
  teamId: string,
  competition: Competition,
  season: Season,
  isNational: boolean,
): void {
  ds.teams.push({ id: teamId, name: deslugTeam(teamId), competition, isNational });
  const teamRng = new Rng(`${rootSeed}:${teamId}`);
  const squadSize = teamRng.int(16, 22);

  for (let shirt = 1; shirt <= squadSize; shirt++) {
    const position = shirtToPosition(shirt);
    const group = POSITION_GROUP_BY_CODE[position];
    const nameRng = new Rng(`${rootSeed}:name:${teamId}:${shirt}`);
    const first = nameRng.pick(FIRST_NAMES);
    const last = nameRng.pick(LAST_NAMES);
    const name = `${first} ${last}`;
    const nameSlug = `${first}-${last}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const playerId = `${teamId}-${nameSlug}-${shirt}`;
    const player: Player = { id: playerId, name, teamId, position };
    ds.players.push(player);

    const playerRng = new Rng(`${rootSeed}:player:${playerId}`);
    const talent = clamp(playerRng.normal(1, 0.15), 0.65, 1.4);
    const nMatches = playerRng.int(6, 12);
    for (let m = 1; m <= nMatches; m++) {
      const matchId = `${competition}-${season}-${teamId}-m${m}`;
      buildPlayerMatch(ds.records, playerRng, player, group, talent, competition, season, matchId);
    }
  }
}

function buildTestTeam(ds: SeedDataset, rootSeed: number, teamId: string): void {
  ds.teams.push({ id: teamId, name: deslugTeam(teamId), competition: TEST_COMP, isNational: true });
  const teamRng = new Rng(`${rootSeed}:testteam:${teamId}`);
  const talent = clamp(teamRng.normal(1, 0.1), 0.8, 1.25);
  const nMatches = teamRng.int(4, 6);
  for (let m = 1; m <= nMatches; m++) {
    const matchId = `${TEST_COMP}-${TEST_SEASON}-${teamId}-m${m}`;
    buildTeamMatch(ds.records, teamRng, teamId, talent, TEST_COMP, TEST_SEASON, matchId);
  }
}

function deslugTeam(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Build the complete deterministic dataset for the given seed. */
export function buildSeedDataset(seed: number = DEFAULT_SEED): SeedDataset {
  const ds: SeedDataset = { teams: [], players: [], records: [] };
  for (const teamId of URC_TEAMS) buildSquad(ds, seed, teamId, CLUB_COMP, CLUB_SEASON, false);
  for (const teamId of SUPER_RUGBY_TEAMS) buildSquad(ds, seed, teamId, SR_COMP, SR_SEASON, false);
  for (const teamId of NATIONS_TEAMS) buildTestTeam(ds, seed, teamId);
  return ds;
}

/** Build + persist the dataset. Idempotent (deterministic ids => upsert). */
export async function seedDatabase(
  repo: Repository,
  seed: number = DEFAULT_SEED,
): Promise<SeedDataset> {
  const ds = buildSeedDataset(seed);
  await repo.upsertTeams(ds.teams);
  await repo.upsertPlayers(ds.players);
  await repo.upsertRecords(ds.records);
  return ds;
}
