import { Repository } from "@ruckmetrics/store";
import { describe, expect, it } from "vitest";
import { buildSeedDataset, seedDatabase, DEFAULT_SEED } from "./seed.js";

describe("buildSeedDataset", () => {
  it("is fully deterministic for a given seed", () => {
    const a = buildSeedDataset(DEFAULT_SEED);
    const b = buildSeedDataset(DEFAULT_SEED);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b)); // identical ids AND values
  });

  it("produces different values for a different seed", () => {
    const a = buildSeedDataset(1);
    const b = buildSeedDataset(2);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("covers all scopes, competitions and position groups", () => {
    const ds = buildSeedDataset(DEFAULT_SEED);
    const urc = ds.teams.filter((t) => t.competition === "URC");
    expect(urc.length).toBe(12); // twelveSquadMedian benchmark is meaningful
    expect(ds.teams.some((t) => t.competition === "SUPER_RUGBY")).toBe(true);
    expect(ds.teams.filter((t) => t.competition === "NATIONS_CHAMPIONSHIP" && t.isNational).length).toBeGreaterThanOrEqual(8);

    // every URC position group is represented
    const groups = new Set(ds.players.map((p) => p.position));
    for (const shirt of ["1", "4", "6", "9", "10", "12", "11"]) expect(groups.has(shirt as never)).toBe(true);

    // no PAID metric leaked into any record
    const paidMetrics = ["t_visitsTo22", "t_territoryPct", "t_oppPassesPerSuccessTackle", "t_turnoversLostForced"];
    for (const r of ds.records) for (const m of paidMetrics) expect(r.values[m]).toBeUndefined();
  });

  it("populates rate numerators together with their denominators", () => {
    const ds = buildSeedDataset(DEFAULT_SEED);
    const per80 = ds.records.find((r) => Number.isFinite(r.values.p_tacklesPer80))!;
    expect(Number.isFinite(per80.values.minutesPlayed)).toBe(true);
    const perCarry = ds.records.find((r) => Number.isFinite(r.values.t_postContactMetresPerCarry))!;
    expect(Number.isFinite(perCarry.values.carries)).toBe(true);
  });
});

describe("seedDatabase", () => {
  it("persists a queryable cohort for both scopes", { timeout: 120_000 }, async () => {
    const repo = await Repository.open(":memory:");
    try {
      await seedDatabase(repo, DEFAULT_SEED);
      const club = await repo.getCohort({ scope: "PLAYER_CLUB", competition: "URC", season: "2024-25" });
      expect(club.subjects.length).toBeGreaterThan(0);
      const test = await repo.getCohort({ scope: "TEAM_TEST", competition: "NATIONS_CHAMPIONSHIP", season: "2025" });
      expect(test.subjects.length).toBeGreaterThanOrEqual(8);
      const fresh = await repo.freshness();
      expect(fresh.some((f) => f.source === "derived")).toBe(true);
    } finally {
      repo.close();
    }
  });
});
