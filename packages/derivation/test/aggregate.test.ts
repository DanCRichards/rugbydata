import { describe, expect, it } from "vitest";
import { aggregateSubjectMetric } from "../src/aggregate.js";
import { DataIntegrityError } from "../src/errors.js";
import { lookupFrom, metric, rec } from "./helpers.js";

const noLookup = lookupFrom([]);

describe("aggregateSubjectMetric — mean", () => {
  const m = metric({ id: "x", aggregation: "mean" });
  it("averages present values", () => {
    const v = aggregateSubjectMetric([rec("a", { x: 4 }), rec("a", { x: 6 })], m, noLookup);
    expect(v).toBe(5);
  });
  it("ignores records missing the metric (no imputation of zero)", () => {
    const v = aggregateSubjectMetric([rec("a", { x: 4 }), rec("a", { other: 6 })], m, noLookup);
    expect(v).toBe(4);
  });
  it("returns null when the subject has no data for the metric", () => {
    const v = aggregateSubjectMetric([rec("a", { other: 1 })], m, noLookup);
    expect(v).toBeNull();
  });
});

describe("aggregateSubjectMetric — sum", () => {
  const m = metric({ id: "tries", aggregation: "sum" });
  it("sums across matches", () => {
    const v = aggregateSubjectMetric(
      [rec("a", { tries: 1 }), rec("a", { tries: 2 }), rec("a", { tries: 0 })],
      m,
      noLookup,
    );
    expect(v).toBe(3);
  });
});

describe("aggregateSubjectMetric — rate", () => {
  it("normalises per 80 minutes", () => {
    const m = metric({ id: "tk", aggregation: "rate", normalizationBasis: "per80" });
    // 10 tackles in 40 mins + 20 tackles in 80 mins => 30 / 120 * 80 = 20 per 80
    const v = aggregateSubjectMetric(
      [rec("a", { tk: 10, minutesPlayed: 40 }), rec("a", { tk: 20, minutesPlayed: 80 })],
      m,
      noLookup,
    );
    expect(v).toBe(20);
  });
  it("normalises per 100 rucks", () => {
    const m = metric({ id: "lb", aggregation: "rate", normalizationBasis: "per100Rucks" });
    // 5 line breaks over 200 rucks => 5/200*100 = 2.5
    const v = aggregateSubjectMetric([rec("t", { lb: 5, teamRucks: 200 })], m, noLookup);
    expect(v).toBe(2.5);
  });
  it("normalises per visit", () => {
    const m = metric({ id: "pts", aggregation: "rate", normalizationBasis: "perVisit" });
    const v = aggregateSubjectMetric([rec("t", { pts: 21, visitsTo22: 7 })], m, noLookup);
    expect(v).toBe(3);
  });
  it("normalises per carry", () => {
    const m = metric({ id: "pcm", aggregation: "rate", normalizationBasis: "perCarry" });
    const v = aggregateSubjectMetric([rec("t", { pcm: 100, carries: 40 })], m, noLookup);
    expect(v).toBe(2.5);
  });
  it("FAILS LOUD when a numerator is present without its denominator", () => {
    const m = metric({ id: "tk", aggregation: "rate", normalizationBasis: "per80" });
    expect(() => aggregateSubjectMetric([rec("a", { tk: 10 })], m, noLookup)).toThrow(
      DataIntegrityError,
    );
  });
  it("returns null (not NaN) when the denominator sums to zero", () => {
    const m = metric({ id: "tk", aggregation: "rate", normalizationBasis: "per80" });
    const v = aggregateSubjectMetric([rec("a", { tk: 0, minutesPlayed: 0 })], m, noLookup);
    expect(v).toBeNull();
  });
  it("returns null when the subject has no rate data at all", () => {
    const m = metric({ id: "tk", aggregation: "rate", normalizationBasis: "per80" });
    const v = aggregateSubjectMetric([rec("a", { other: 1 })], m, noLookup);
    expect(v).toBeNull();
  });
});

describe("aggregateSubjectMetric — weighted composite", () => {
  const scrum = metric({ id: "scrum", aggregation: "mean" });
  const lineout = metric({ id: "lineout", aggregation: "mean" });
  const restart = metric({ id: "restart", aggregation: "mean" });
  const setPiece = metric({
    id: "setPiece",
    aggregation: "weighted",
    components: [
      { metricId: "scrum", weight: 1 },
      { metricId: "lineout", weight: 2 },
      { metricId: "restart", weight: 1 },
    ],
  });
  const lookup = lookupFrom([scrum, lineout, restart, setPiece]);

  it("computes the weighted average of components", () => {
    // (1*90 + 2*80 + 1*100) / 4 = 350/4 = 87.5
    const v = aggregateSubjectMetric(
      [rec("t", { scrum: 90, lineout: 80, restart: 100 })],
      setPiece,
      lookup,
    );
    expect(v).toBe(87.5);
  });
  it("drops a missing component from the weighting (no imputation)", () => {
    // only scrum & lineout present => (1*90 + 2*80)/(1+2) = 250/3
    const v = aggregateSubjectMetric([rec("t", { scrum: 90, lineout: 80 })], setPiece, lookup);
    expect(v).toBeCloseTo(250 / 3);
  });
  it("returns null when no component has data", () => {
    const v = aggregateSubjectMetric([rec("t", { irrelevant: 1 })], setPiece, lookup);
    expect(v).toBeNull();
  });
  it("throws when a weighted metric declares no components", () => {
    const broken = metric({ id: "broken", aggregation: "weighted" });
    expect(() => aggregateSubjectMetric([rec("t", { x: 1 })], broken, lookupFrom([broken]))).toThrow(
      DataIntegrityError,
    );
  });
});

describe("determinism", () => {
  it("produces identical output for identical input", () => {
    const m = metric({ id: "x", aggregation: "mean" });
    const records = [rec("a", { x: 3 }), rec("a", { x: 9 })];
    const a = aggregateSubjectMetric(records, m, noLookup);
    const b = aggregateSubjectMetric(records, m, noLookup);
    expect(a).toBe(b);
  });
});
