import { describe, expect, it } from "vitest";
import type { FetchQuery } from "../adapter.js";
import { MatchStatRecord } from "@ruckmetrics/contracts";
import { RugbyPyAdapter } from "./rugbypy.js";
import { MatchCentreAdapter } from "./matchcentre.js";
import { RugbyPassAdapter, parseEmbeddedDeepMetrics } from "./rugbypass.js";
import { PaidProviderAdapter } from "./paid-stub.js";

const PLAYER_Q: FetchQuery = { scope: "PLAYER_CLUB", competition: "URC", season: "2024-25" };
const TEAM_Q: FetchQuery = { scope: "TEAM_TEST", competition: "NATIONS_CHAMPIONSHIP", season: "2025" };

describe("RugbyPyAdapter (fixture)", () => {
  it("parses player box scores with rate numerator + denominator on the same row", async () => {
    const rows = await new RugbyPyAdapter().fetchFixture(PLAYER_Q);
    expect(rows.length).toBe(3);
    const doris = rows.find((r) => r.subjectId === "leinster-caelan-doris-8")!;
    expect(doris.teamId).toBe("leinster");
    expect(doris.values.p_tacklesPer80).toBeTypeOf("number");
    expect(doris.values.minutesPlayed).toBe(80); // denominator present with numerator
    expect(doris.values.p_tacklesMade).toBe(doris.values.p_tacklesPer80);
  });

  it("parses team box scores with reserved denominators", async () => {
    const rows = await new RugbyPyAdapter().fetchFixture(TEAM_Q);
    expect(rows.length).toBe(2);
    const ire = rows.find((r) => r.subjectId === "ireland")!;
    expect(ire.values.t_turnoversWon).toBe(9);
    expect(ire.values.carries).toBe(112);
  });
});

describe("RugbyPassAdapter (fixture HTML)", () => {
  it("extracts embedded __NEXT_DATA__ deep metrics", async () => {
    const rows = await new RugbyPassAdapter().fetchFixture(PLAYER_Q);
    const doris = rows.find((r) => r.subjectId === "leinster-caelan-doris-8")!;
    expect(doris.values.p_postContactMetres).toBe(21);
    expect(doris.values.p_ruckArrivalEffect).toBe(78); // locks/loose only -> present for #8
    const gibson = rows.find((r) => r.subjectId === "leinster-jamison-gibson-park-9")!;
    expect(gibson.values.p_ruckArrivalEffect).toBeUndefined(); // omitted, never imputed
  });

  it("maps team dominant tackles", async () => {
    const rows = await new RugbyPassAdapter().fetchFixture(TEAM_Q);
    expect(rows.find((r) => r.subjectId === "ireland")!.values.t_dominantTackles).toBe(31);
  });

  it("throws on HTML with no embedded JSON (fail loud, never impute)", () => {
    expect(() => parseEmbeddedDeepMetrics("<html><body>no data</body></html>")).toThrow();
  });
});

describe("MatchCentreAdapter (fixture)", () => {
  it("parses player lineout takes (rate) + set-piece steals", async () => {
    const rows = await new MatchCentreAdapter().fetchFixture(PLAYER_Q);
    const doris = rows.find((r) => r.subjectId === "leinster-caelan-doris-8")!;
    expect(doris.values.p_lineoutTakesPer80).toBe(4);
    expect(doris.values.minutesPlayed).toBe(80);
    expect(doris.values.p_oppLineoutsStolen).toBe(1);
  });

  it("parses team scrum/lineout retention", async () => {
    const rows = await new MatchCentreAdapter().fetchFixture(TEAM_Q);
    const ire = rows.find((r) => r.subjectId === "ireland")!;
    expect(ire.values.t_scrumWinPctOwn).toBe(96);
    expect(ire.values.t_lineoutWinPctOwn).toBe(91.5);
  });
});

describe("PaidProviderAdapter", () => {
  it("produces nothing (paid metrics intentionally unavailable)", async () => {
    const adapter = new PaidProviderAdapter();
    expect((await adapter.fetch(TEAM_Q)).rows).toEqual([]);
  });
});

describe("adapter fetch() fallback", () => {
  it("falls back to fixtures when the live source is unavailable", async () => {
    // rugbypy: python/rugbypy not installed -> AdapterUnavailableError -> fixture
    const outcome = await new RugbyPyAdapter().fetch(PLAYER_Q);
    expect(outcome.mode).toBe("fixture");
    expect(outcome.rows.length).toBeGreaterThan(0);
    // every row builds a schema-valid record
    for (const r of outcome.rows) {
      expect(() =>
        MatchStatRecord.parse({
          id: `PLAYER:${r.subjectId}:${r.matchId}:rugbypy`,
          entityKind: r.entityKind,
          subjectId: r.subjectId,
          matchId: r.matchId,
          competition: r.competition,
          season: r.season,
          position: r.position ?? null,
          values: r.values,
          provenance: { source: "rugbypy", url: null, fetchedAt: "2025-06-01T12:00:00.000Z" },
        }),
      ).not.toThrow();
    }
  });
});
