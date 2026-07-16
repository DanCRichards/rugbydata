import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MatchStatRecord, Player, Team } from "@ruckmetrics/contracts";
import { Repository } from "../src/repository.js";

let repo: Repository;

const team: Team = { id: "leinster", name: "Leinster", competition: "URC", isNational: false };
const player: Player = { id: "p1", name: "Caelan Doris", teamId: "leinster", position: "8" };

function record(matchId: string, values: Record<string, number>): MatchStatRecord {
  return {
    id: `PLAYER:p1:${matchId}`,
    entityKind: "PLAYER",
    subjectId: "p1",
    matchId,
    competition: "URC",
    season: "2024-25",
    position: "8",
    values,
    provenance: { source: "rugbypy", url: null, fetchedAt: "2025-02-01T00:00:00.000Z" },
  };
}

beforeEach(async () => {
  repo = await Repository.open(":memory:");
});
afterEach(() => repo.close());

describe("Repository", () => {
  it("persists and reads back a cohort with derived subject metadata", async () => {
    await repo.upsertTeams([team]);
    await repo.upsertPlayers([player]);
    await repo.upsertRecords([record("m1", { p_tacklesMade: 12 }), record("m2", { p_tacklesMade: 8 })]);

    const cohort = await repo.getCohort({ scope: "PLAYER_CLUB", competition: "URC", season: "2024-25" });
    expect(cohort.records).toHaveLength(2);
    expect(cohort.subjects).toHaveLength(1);
    const s = cohort.subjects[0]!;
    expect(s.label).toBe("Caelan Doris");
    expect(s.positionGroup).toBe("looseForwards");
    expect(s.matchCount).toBe(2);
  });

  it("is idempotent: re-upserting the same ids does not duplicate", async () => {
    await repo.upsertTeams([team]);
    await repo.upsertPlayers([player]);
    await repo.upsertRecords([record("m1", { p_tacklesMade: 12 })]);
    await repo.upsertRecords([record("m1", { p_tacklesMade: 99 })]); // same id, new value
    const cohort = await repo.getCohort({ scope: "PLAYER_CLUB", competition: "URC", season: "2024-25" });
    expect(cohort.records).toHaveLength(1);
    expect(cohort.records[0]!.values.p_tacklesMade).toBe(99);
  });

  it("filters cohorts by competition and season", async () => {
    await repo.upsertTeams([team]);
    await repo.upsertPlayers([player]);
    await repo.upsertRecords([record("m1", { p_tacklesMade: 5 })]);
    const empty = await repo.getCohort({ scope: "PLAYER_CLUB", competition: "SUPER_RUGBY", season: "2024-25" });
    expect(empty.records).toHaveLength(0);
  });

  it("reports data freshness by source and scope", async () => {
    await repo.upsertTeams([team]);
    await repo.upsertPlayers([player]);
    await repo.upsertRecords([record("m1", { p_tacklesMade: 5 })]);
    const fresh = await repo.freshness();
    expect(fresh).toHaveLength(1);
    expect(fresh[0]!.source).toBe("rugbypy");
    expect(fresh[0]!.scope).toBe("PLAYER_CLUB");
    expect(fresh[0]!.rowCount).toBe(1);
    expect(fresh[0]!.newestFetchedAt).toBe("2025-02-01T00:00:00.000Z");
  });
});
