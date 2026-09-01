import { describe, expect, it } from "vitest";
import { MetricDefinition, Preset, isAvailable } from "@ruckmetrics/contracts";
import { ALL_METRICS, SEED_PRESETS, getMetric, metricsCatalog } from "../src/index.js";

describe("metrics registry", () => {
  it("every metric conforms to the MetricDefinition schema", () => {
    for (const m of ALL_METRICS) expect(() => MetricDefinition.parse(m)).not.toThrow();
  });

  it("has globally unique metric ids", () => {
    const ids = ALL_METRICS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("prefixes ids by scope (p_ for player, t_ for team)", () => {
    for (const m of ALL_METRICS) {
      expect(m.id.startsWith(m.scope === "PLAYER_CLUB" ? "p_" : "t_")).toBe(true);
    }
  });

  it("marks penalties/turnovers-lost as lower-is-better", () => {
    expect(getMetric("p_penaltiesConceded").higherIsBetter).toBe(false);
    expect(getMetric("t_turnoversLost").higherIsBetter).toBe(false);
  });

  it("flags paid-only metrics as unavailable and free/derive as available", () => {
    expect(isAvailable(getMetric("t_visitsTo22"))).toBe(false); // PAID
    expect(isAvailable(getMetric("p_defendersBeaten"))).toBe(true); // FREE
    expect(isAvailable(getMetric("p_workRate"))).toBe(true); // DERIVE
  });

  it("serialises a valid catalog", () => {
    expect(() => metricsCatalog()).not.toThrow();
  });

  it("composite metrics reference registered components of the same scope", () => {
    for (const m of ALL_METRICS) {
      for (const c of m.components) {
        const comp = getMetric(c.metricId);
        expect(comp.scope).toBe(m.scope);
      }
    }
  });
});

describe("seed presets", () => {
  it("ships exactly the 22 named analyses", () => {
    expect(SEED_PRESETS).toHaveLength(22);
  });

  it("every preset is a valid Preset with in-registry, scope-correct metrics", () => {
    for (const p of SEED_PRESETS) {
      expect(() => Preset.parse(p)).not.toThrow();
      const d = p.definition;
      const refs = [d.xMetric, d.yMetric, d.sizeMetric, ...d.categoryMetrics, ...d.stackMetrics].filter(
        (x): x is string => typeof x === "string" && x.length > 0,
      );
      for (const ref of refs) expect(getMetric(ref).scope).toBe(d.scope);
    }
  });

  it("has unique preset ids and spec references for all 22", () => {
    expect(new Set(SEED_PRESETS.map((p) => p.id)).size).toBe(22);
    expect(SEED_PRESETS.every((p) => p.specRef.length > 0)).toBe(true);
  });

  it("keeps non-scatter presets typed correctly", () => {
    expect(SEED_PRESETS.find((p) => p.id === "p1-final-summary")!.definition.chartType).toBe("radar");
    expect(SEED_PRESETS.find((p) => p.id === "p2-turnovers-lost-split")!.definition.chartType).toBe(
      "stackedBar",
    );
    expect(SEED_PRESETS.find((p) => p.id === "p2-blitz-or-drift")!.definition.chartType).toBe("strip");
  });
});
