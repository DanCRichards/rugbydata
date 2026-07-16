import { describe, expect, it } from "vitest";
import { median, percentileRanks } from "../src/stats.js";
import { DataIntegrityError } from "../src/errors.js";

describe("median", () => {
  it("computes the middle of an odd-length set", () => {
    expect(median([3, 1, 2])).toBe(2);
  });
  it("averages the two middle values of an even-length set", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("handles a single value", () => {
    expect(median([7])).toBe(7);
  });
  it("does not mutate the input", () => {
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
  it("throws loud on empty input", () => {
    expect(() => median([])).toThrow(DataIntegrityError);
  });
});

describe("percentileRanks", () => {
  it("returns empty for empty input", () => {
    expect(percentileRanks(new Map(), true).size).toBe(0);
  });
  it("maps a single subject to 50", () => {
    const r = percentileRanks(new Map([["a", 5]]), true);
    expect(r.get("a")).toBe(50);
  });
  it("ranks higher values higher when higherIsBetter", () => {
    const r = percentileRanks(
      new Map([
        ["low", 1],
        ["mid", 2],
        ["high", 3],
      ]),
      true,
    );
    expect(r.get("high")!).toBeGreaterThan(r.get("mid")!);
    expect(r.get("mid")!).toBeGreaterThan(r.get("low")!);
  });
  it("inverts ranks when lower is better", () => {
    const hi = percentileRanks(
      new Map([
        ["a", 1],
        ["b", 2],
        ["c", 3],
      ]),
      true,
    );
    const lo = percentileRanks(
      new Map([
        ["a", 1],
        ["b", 2],
        ["c", 3],
      ]),
      false,
    );
    // "a" is the smallest: best when lower-is-better, worst when higher-is-better
    expect(lo.get("a")!).toBeGreaterThan(hi.get("a")!);
    expect(lo.get("a")! + hi.get("a")!).toBeCloseTo(100);
  });
  it("gives tied values identical midpoint ranks", () => {
    const r = percentileRanks(
      new Map([
        ["a", 5],
        ["b", 5],
        ["c", 5],
        ["d", 5],
      ]),
      true,
    );
    for (const v of r.values()) expect(v).toBeCloseTo(50);
  });
  it("is deterministic across calls", () => {
    const input = new Map([
      ["a", 10],
      ["b", 20],
      ["c", 30],
    ]);
    const first = percentileRanks(input, true);
    const second = percentileRanks(input, true);
    expect([...first.entries()]).toEqual([...second.entries()]);
  });
});
