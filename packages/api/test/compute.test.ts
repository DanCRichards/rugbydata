import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MatchStatRecord, Player, Team } from "@ruckmetrics/contracts";
import { Repository } from "@ruckmetrics/store";
import { getPreset } from "@ruckmetrics/registry";
import { ChartDefinitionError, computeChart } from "../src/compute.js";

let repo: Repository;

const FETCHED = "2025-03-01T00:00:00.000Z";

function prec(
  subjectId: string,
  matchId: string,
  position: MatchStatRecord["position"],
  values: Record<string, number>,
): MatchStatRecord {
  return {
    id: `PLAYER:${subjectId}:${matchId}`,
    entityKind: "PLAYER",
    subjectId,
    matchId,
    competition: "URC",
    season: "2024-25",
    position,
    values,
    provenance: { source: "rugbypy", url: null, fetchedAt: FETCHED },
  };
}

function trec(subjectId: string, matchId: string, values: Record<string, number>): MatchStatRecord {
  return {
    id: `TEAM:${subjectId}:${matchId}`,
    entityKind: "TEAM",
    subjectId,
    matchId,
    competition: "NATIONS_CHAMPIONSHIP",
    season: "2025",
    position: null,
    values,
    provenance: { source: "rugbypy", url: null, fetchedAt: FETCHED },
  };
}

beforeEach(async () => {
  repo = await Repository.open(":memory:");

  const teams: Team[] = [
    { id: "leinster", name: "Leinster", competition: "URC", isNational: false },
    { id: "munster", name: "Munster", competition: "URC", isNational: false },
  ];
  const players: Player[] = [
    { id: "doris", name: "Doris", teamId: "leinster", position: "8" }, // looseForwards
    { id: "beirne", name: "Beirne", teamId: "munster", position: "4" }, // locks
    { id: "sexton", name: "Sexton", teamId: "leinster", position: "10" }, // flyHalf
    { id: "lowe", name: "Lowe", teamId: "leinster", position: "11" }, // backThree
  ];
  await repo.upsertTeams(teams);
  await repo.upsertPlayers(players);

  await repo.upsertRecords([
    prec("doris", "m1", "8", { p_defendersBeaten: 4, p_postContactMetres: 30, p_penaltiesConceded: 1 }),
    prec("doris", "m2", "8", { p_defendersBeaten: 6, p_postContactMetres: 40, p_penaltiesConceded: 0 }),
    prec("beirne", "m1", "4", { p_defendersBeaten: 2, p_postContactMetres: 15, p_penaltiesConceded: 2 }),
    prec("beirne", "m2", "4", { p_defendersBeaten: 3, p_postContactMetres: 20, p_penaltiesConceded: 1 }),
    prec("sexton", "m1", "10", { p_defendersBeaten: 1, p_postContactMetres: 5, p_tryAssists: 2, p_triesScored: 0, p_kickVolume: 18 }),
    // lowe deliberately has NO postContactMetres -> tests transparent exclusion
    prec("lowe", "m1", "11", { p_defendersBeaten: 8 }),
  ]);

  const teamRows: Team[] = [
    { id: "ire", name: "Ireland", competition: "NATIONS_CHAMPIONSHIP", isNational: true },
    { id: "nzl", name: "New Zealand", competition: "NATIONS_CHAMPIONSHIP", isNational: true },
    { id: "fra", name: "France", competition: "NATIONS_CHAMPIONSHIP", isNational: true },
  ];
  await repo.upsertTeams(teamRows);
  await repo.upsertRecords([
    trec("ire", "t1", { t_turnoversWon: 8, t_turnoversLost: 10 }),
    trec("nzl", "t1", { t_turnoversWon: 12, t_turnoversLost: 8 }),
    trec("fra", "t1", { t_turnoversWon: 10, t_turnoversLost: 12 }),
  ]);
});

afterEach(() => repo.close());

describe("computeChart — scatter", () => {
  it("runs the Carrier DNA preset end-to-end", async () => {
    const preset = getPreset("p1-carrier-dna")!;
    const res = await computeChart(repo, preset.definition);
    expect(res.chartType).toBe("scatter");
    // doris + beirne have both metrics; sexton has both; lowe missing y -> excluded
    const ids = res.points.map((p) => p.subjectId).sort();
    expect(ids).toEqual(["beirne", "doris", "sexton"]);
    expect(res.warnings.some((w) => w.includes("excluded"))).toBe(true);
    const doris = res.points.find((p) => p.subjectId === "doris")!;
    expect(doris.x).toBe(5); // mean(4,6)
    expect(doris.y).toBe(35); // mean(30,40)
  });

  it("emits positional percentiles in 0..100 with percent axis units", async () => {
    const preset = getPreset("p1-clean-engine")!; // percentileMode: positional
    const res = await computeChart(repo, preset.definition);
    expect(res.xAxis.percentile).toBe(true);
    expect(res.xAxis.unit).toBe("percent");
    for (const p of res.points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(100);
    }
  });

  it("computes a benchmark median crosshair when overlay is set", async () => {
    const preset = getPreset("p2-turnover-battle")!; // testMedian overlay
    const res = await computeChart(repo, preset.definition);
    expect(res.benchmark).not.toBeNull();
    expect(res.benchmark!.x).toBe(10); // median(8,12,10)
    expect(res.benchmark!.y).toBe(10); // median(10,8,12)
    expect(res.benchmark!.label).toContain("Test Median");
  });
});

describe("computeChart — position filter", () => {
  it("restricts a fly-half preset to fly-halves only", async () => {
    const preset = getPreset("p1-triple-threats")!; // flyHalf filter, size = kickVolume
    const res = await computeChart(repo, preset.definition);
    expect(res.points.map((p) => p.subjectId)).toEqual(["sexton"]);
    expect(res.sizeAxis).not.toBeNull();
    expect(res.points[0]!.size).toBe(18);
  });
});

describe("computeChart — availability gating", () => {
  it("returns an empty chart with a notice for a paid-only preset", async () => {
    const preset = getPreset("p2-attack-shape")!; // both metrics PAID_UNAVAILABLE
    const res = await computeChart(repo, preset.definition);
    expect(res.points).toHaveLength(0);
    expect(res.warnings.some((w) => w.toLowerCase().includes("paid"))).toBe(true);
  });
});

describe("computeChart — validation", () => {
  it("throws ChartDefinitionError on a scope-mismatched metric", async () => {
    const preset = getPreset("p1-carrier-dna")!;
    const bad = { ...preset.definition, yMetric: "t_turnoversWon" }; // team metric in player chart
    await expect(computeChart(repo, bad)).rejects.toBeInstanceOf(ChartDefinitionError);
  });
});
