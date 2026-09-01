import { Repository } from "@ruckmetrics/store";
import { MatchStatRecord } from "@ruckmetrics/contracts";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { defaultAdapters } from "./index.js";
import { runEtl } from "./etl.js";

describe("runEtl (fixture fallback)", () => {
  let repo: Repository;
  beforeEach(async () => {
    repo = await Repository.open(":memory:");
  });
  afterEach(() => repo.close());

  it("merges sources into schema-valid records and synthesizes DERIVE rows", async () => {
    const summary = await runEtl(
      { scope: "PLAYER_CLUB", competition: "URC", season: "2024-25" },
      { repo, adapters: defaultAdapters() },
    );

    // paid produced nothing; the free sources all fell back to fixtures
    const paid = summary.perSource.find((s) => s.source === "paidProvider")!;
    expect(paid.records).toBe(0);
    const free = summary.perSource.filter((s) => s.source !== "paidProvider");
    expect(free.every((s) => s.mode === "fixture")).toBe(true);

    const cohort = await repo.getCohort({
      scope: "PLAYER_CLUB",
      competition: "URC",
      season: "2024-25",
    });
    // all persisted rows re-validate against the contract
    for (const r of cohort.records) expect(() => MatchStatRecord.parse(r)).not.toThrow();

    // a derived work-rate record exists carrying numerator + minutes denominator
    const derived = cohort.records.filter((r) => r.provenance.source === "derived");
    expect(derived.length).toBeGreaterThan(0);
    for (const d of derived) {
      expect(Number.isFinite(d.values.p_workRate)).toBe(true);
      expect(Number.isFinite(d.values.minutesPlayed)).toBe(true);
    }

    // a rate record carries its denominator on the same row
    const rateRow = cohort.records.find((r) => Number.isFinite(r.values.p_tacklesPer80))!;
    expect(Number.isFinite(rateRow.values.minutesPlayed)).toBe(true);
  });

  it("is idempotent: re-running yields the same row count", async () => {
    const q = { scope: "TEAM_TEST", competition: "NATIONS_CHAMPIONSHIP", season: "2025" } as const;
    await runEtl(q, { repo, adapters: defaultAdapters() });
    const first = (await repo.getCohort(q)).records.length;
    await runEtl(q, { repo, adapters: defaultAdapters() });
    const second = (await repo.getCohort(q)).records.length;
    expect(second).toBe(first);
    expect(first).toBeGreaterThan(0);
  });
});
