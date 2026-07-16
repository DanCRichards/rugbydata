import { describe, expect, it } from "vitest";
import {
  benchmarkMedianValue,
  cohortRawValues,
  positionalPercentileValues,
  type SubjectRecords,
} from "../src/cohort.js";
import { lookupFrom, metric, rec } from "./helpers.js";

const noLookup = lookupFrom([]);
const m = metric({ id: "x", aggregation: "mean" });

describe("cohortRawValues", () => {
  it("returns a value per subject with data and omits subjects without", () => {
    const subjects: SubjectRecords[] = [
      { subjectId: "a", positionGroup: null, records: [rec("a", { x: 10 })] },
      { subjectId: "b", positionGroup: null, records: [rec("b", { x: 20 })] },
      { subjectId: "c", positionGroup: null, records: [rec("c", { other: 1 })] },
    ];
    const raw = cohortRawValues(subjects, m, noLookup);
    expect(raw.get("a")).toBe(10);
    expect(raw.get("b")).toBe(20);
    expect(raw.has("c")).toBe(false);
  });
});

describe("positionalPercentileValues", () => {
  it("ranks subjects WITHIN their own position group", () => {
    // Two groups; each subject should be ranked only against its group peers.
    const subjects: SubjectRecords[] = [
      { subjectId: "fw1", positionGroup: "looseForwards", records: [rec("fw1", { x: 1 })] },
      { subjectId: "fw2", positionGroup: "looseForwards", records: [rec("fw2", { x: 9 })] },
      { subjectId: "bk1", positionGroup: "centres", records: [rec("bk1", { x: 100 })] },
      { subjectId: "bk2", positionGroup: "centres", records: [rec("bk2", { x: 900 })] },
    ];
    const pct = positionalPercentileValues(subjects, m, noLookup);
    // Within loose forwards, fw2 > fw1; within centres, bk2 > bk1. The huge back
    // values do NOT drag the forwards' percentiles because groups are separate.
    expect(pct.get("fw2")!).toBeGreaterThan(pct.get("fw1")!);
    expect(pct.get("bk2")!).toBeGreaterThan(pct.get("bk1")!);
    // Top of each 2-person group gets the same rank regardless of raw magnitude.
    expect(pct.get("fw2")).toBeCloseTo(pct.get("bk2")!);
  });

  it("ranks null-position (team) subjects as one cohort", () => {
    const subjects: SubjectRecords[] = [
      { subjectId: "t1", positionGroup: null, records: [rec("t1", { x: 1 }, { entityKind: "TEAM" })] },
      { subjectId: "t2", positionGroup: null, records: [rec("t2", { x: 2 }, { entityKind: "TEAM" })] },
      { subjectId: "t3", positionGroup: null, records: [rec("t3", { x: 3 }, { entityKind: "TEAM" })] },
    ];
    const pct = positionalPercentileValues(subjects, m, noLookup);
    expect(pct.get("t3")!).toBeGreaterThan(pct.get("t1")!);
  });
});

describe("benchmarkMedianValue", () => {
  it("computes the median of the benchmark cohort", () => {
    const subjects: SubjectRecords[] = [
      { subjectId: "a", positionGroup: null, records: [rec("a", { x: 10 })] },
      { subjectId: "b", positionGroup: null, records: [rec("b", { x: 20 })] },
      { subjectId: "c", positionGroup: null, records: [rec("c", { x: 30 })] },
    ];
    expect(benchmarkMedianValue(subjects, m, noLookup)).toBe(20);
  });
  it("returns null when no benchmark subject has data", () => {
    const subjects: SubjectRecords[] = [
      { subjectId: "a", positionGroup: null, records: [rec("a", { other: 1 })] },
    ];
    expect(benchmarkMedianValue(subjects, m, noLookup)).toBeNull();
  });
});
