import {
  broadGroupOf,
  isAvailable,
  type AxisMeta,
  type BenchmarkResult,
  type CategorySeries,
  type ChartDefinition,
  type ChartPoint,
  type ComputeChartResponse,
  type MetricDefinition,
  type StackSeries,
} from "@ruckmetrics/contracts";
import {
  cohortRawValues,
  median,
  positionalPercentileValues,
  type SubjectRecords,
} from "@ruckmetrics/derivation";
import { getMetric, tryGetMetric } from "@ruckmetrics/registry";
import type { Repository } from "@ruckmetrics/store";

/**
 * The chart engine's brain. Turns ONE ChartDefinition into a fully-computed,
 * schema-shaped response by composing the store (data), the registry (metric
 * semantics) and the derivation layer (pure maths). Every named analysis in the
 * spec flows through exactly this function — there is no per-analysis code.
 *
 * Missing data is handled transparently, never by imputation:
 *  - a required metric that is PAID_UNAVAILABLE => empty chart + explicit notice
 *  - a subject missing a plotted value => excluded, counted in a warning
 */

export class ChartDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChartDefinitionError";
  }
}

const lookup = (id: string): MetricDefinition => getMetric(id);

function resolveMetric(id: string, scope: ChartDefinition["scope"]): MetricDefinition {
  const m = tryGetMetric(id);
  if (!m) throw new ChartDefinitionError(`Unknown metric: ${id}`);
  if (m.scope !== scope) {
    throw new ChartDefinitionError(`Metric ${id} is ${m.scope}, not usable in a ${scope} chart`);
  }
  return m;
}

function axisMeta(m: MetricDefinition, flipped: boolean, percentile: boolean): AxisMeta {
  return {
    metricId: m.id,
    label: m.label,
    unit: percentile ? "percent" : m.unit,
    higherIsBetter: m.higherIsBetter,
    flipped,
    percentile,
  };
}

/** Which metric ids the given chart type CANNOT render without. */
function requiredMetricIds(def: ChartDefinition): string[] {
  switch (def.chartType) {
    case "scatter":
      return [def.xMetric, ...(def.yMetric ? [def.yMetric] : [])];
    case "strip":
      return [def.xMetric];
    case "radar":
    case "groupedBar":
      return [...def.categoryMetrics];
    case "stackedBar":
      return [...def.stackMetrics];
    default:
      return [def.xMetric];
  }
}

export async function computeChart(
  repo: Repository,
  def: ChartDefinition,
): Promise<ComputeChartResponse> {
  const percentile = def.percentileMode === "positional";
  const warnings: string[] = [];

  // Resolve + scope-check every referenced metric up front (throws on bad refs).
  const required = requiredMetricIds(def).map((id) => resolveMetric(id, def.scope));
  const xMetric = resolveMetric(def.xMetric, def.scope);
  const yMetric = def.yMetric ? resolveMetric(def.yMetric, def.scope) : null;
  const sizeMetric = def.sizeMetric ? resolveMetric(def.sizeMetric, def.scope) : null;

  const xAxis = axisMeta(xMetric, def.axisFlips.x, percentile);
  const yAxis = yMetric ? axisMeta(yMetric, def.axisFlips.y, percentile) : null;

  const freshness = await repo.freshness();

  // Availability gate: if the chart CANNOT be drawn because a required metric is
  // paid/unavailable, return an empty-but-valid response with a clear notice.
  const unavailable = required.filter((m) => !isAvailable(m));
  const baseResponse: ComputeChartResponse = {
    chartType: def.chartType,
    percentileMode: def.percentileMode,
    xAxis,
    yAxis,
    sizeAxis: sizeMetric ? axisMeta(sizeMetric, false, false) : null,
    points: [],
    benchmark: null,
    categorySeries: [],
    categoryAxes: [],
    stackSeries: [],
    stackAxes: [],
    warnings,
    freshness,
  };
  if (unavailable.length > 0) {
    for (const m of unavailable) {
      warnings.push(
        `${m.label} requires a paid data provider and is not yet available — this analysis is a wired preset awaiting a paid feed.`,
      );
    }
    return baseResponse;
  }

  // Load + filter the cohort.
  const cohort = await repo.getCohort({
    scope: def.scope,
    competition: def.competition,
    season: def.season,
  });
  const allowedSubjectIds = applyPositionFilter(def, cohort.subjects);
  const subjectMeta = new Map(cohort.subjects.map((s) => [s.subjectId, s]));

  const recordsBySubject = new Map<string, SubjectRecords>();
  for (const r of cohort.records) {
    if (!allowedSubjectIds.has(r.subjectId)) continue;
    let entry = recordsBySubject.get(r.subjectId);
    if (!entry) {
      entry = {
        subjectId: r.subjectId,
        positionGroup: subjectMeta.get(r.subjectId)?.positionGroup ?? null,
        records: [],
      };
      recordsBySubject.set(r.subjectId, entry);
    }
    entry.records.push(r);
  }
  const subjects = [...recordsBySubject.values()];

  const valuesFor = (m: MetricDefinition, asPercentile: boolean): Map<string, number> =>
    asPercentile
      ? positionalPercentileValues(subjects, m, lookup)
      : cohortRawValues(subjects, m, lookup);

  /* -------- non-scatter chart types -------- */
  if (def.chartType === "radar" || def.chartType === "groupedBar") {
    return computeCategory(def, subjects, subjectMeta, percentile, valuesFor, baseResponse);
  }
  if (def.chartType === "stackedBar") {
    return computeStacked(def, subjects, subjectMeta, valuesFor, baseResponse);
  }

  /* -------- scatter / strip -------- */
  const xVals = valuesFor(xMetric, percentile);
  const yVals = yMetric ? valuesFor(yMetric, percentile) : null;
  const sizeVals = sizeMetric ? valuesFor(sizeMetric, false) : null;

  let excludedMissingX = 0;
  let excludedMissingY = 0;
  const points: ChartPoint[] = [];
  for (const s of subjects) {
    const meta = subjectMeta.get(s.subjectId);
    const x = xVals.get(s.subjectId);
    if (x === undefined) {
      excludedMissingX += 1;
      continue;
    }
    let y: number | null = null;
    if (yMetric) {
      const yv = yVals!.get(s.subjectId);
      if (yv === undefined) {
        excludedMissingY += 1;
        continue;
      }
      y = yv;
    }
    points.push({
      subjectId: s.subjectId,
      label: meta?.label ?? s.subjectId,
      teamId: meta?.teamId ?? "",
      positionGroup: meta?.positionGroup ?? null,
      colours: meta?.colours ?? ["#000000"],
      x,
      y,
      size: sizeVals?.get(s.subjectId) ?? null,
    });
  }
  if (excludedMissingX > 0) warnings.push(`${excludedMissingX} excluded: no ${xMetric.label} data.`);
  if (excludedMissingY > 0 && yMetric)
    warnings.push(`${excludedMissingY} excluded: no ${yMetric.label} data.`);
  if (sizeMetric && sizeVals && sizeVals.size === 0)
    warnings.push(`No ${sizeMetric.label} data — markers use a uniform size.`);

  const benchmark = computeBenchmark(def, xVals, yVals);

  return { ...baseResponse, points, benchmark };
}

/* --------------------------- helpers --------------------------- */

function applyPositionFilter(
  def: ChartDefinition,
  subjects: { subjectId: string; positionGroup: string | null }[],
): Set<string> {
  const { groups, broad } = def.positionFilter;
  if (def.scope !== "PLAYER_CLUB" || (groups.length === 0 && !broad)) {
    return new Set(subjects.map((s) => s.subjectId));
  }
  const allowed = new Set<string>();
  for (const s of subjects) {
    const pg = s.positionGroup as import("@ruckmetrics/contracts").PositionGroup | null;
    if (!pg) continue;
    const inGroups = groups.length === 0 || groups.includes(pg);
    const inBroad = !broad || broadGroupOf(pg) === broad;
    if (inGroups && inBroad) allowed.add(s.subjectId);
  }
  return allowed;
}

function computeBenchmark(
  def: ChartDefinition,
  xVals: Map<string, number>,
  yVals: Map<string, number> | null,
): BenchmarkResult | null {
  if (def.benchmarkOverlay === "none") return null;
  const label =
    def.benchmarkOverlay === "twelveSquadMedian" ? "12-Squad Median" : "2023–26 Test Median";
  const xs = [...xVals.values()];
  const ys = yVals ? [...yVals.values()] : [];
  return {
    kind: def.benchmarkOverlay,
    label,
    x: xs.length > 0 ? median(xs) : null,
    y: ys.length > 0 ? median(ys) : null,
  };
}

function computeCategory(
  def: ChartDefinition,
  subjects: SubjectRecords[],
  subjectMeta: Map<string, { label: string; colours: string[] }>,
  percentile: boolean,
  valuesFor: (m: MetricDefinition, asPct: boolean) => Map<string, number>,
  base: ComputeChartResponse,
): ComputeChartResponse {
  const metrics = def.categoryMetrics.map((id) => resolveMetric(id, def.scope));
  const categoryAxes: AxisMeta[] = metrics.map((m) => axisMeta(m, false, percentile));
  const valueMaps = new Map(metrics.map((m) => [m.id, valuesFor(m, percentile)]));

  const categorySeries: CategorySeries[] = subjects.map((s) => {
    const meta = subjectMeta.get(s.subjectId);
    const values: Record<string, number> = {};
    for (const m of metrics) {
      const v = valueMaps.get(m.id)!.get(s.subjectId);
      if (v !== undefined) values[m.id] = v;
    }
    return {
      subjectId: s.subjectId,
      label: meta?.label ?? s.subjectId,
      values,
      colours: meta?.colours ?? ["#000000"],
    };
  });

  // Benchmark median per category, emitted as a synthetic series row.
  if (def.benchmarkOverlay !== "none") {
    const values: Record<string, number> = {};
    for (const m of metrics) {
      const nums = [...valueMaps.get(m.id)!.values()];
      if (nums.length > 0) values[m.id] = median(nums);
    }
    categorySeries.push({
      subjectId: "__benchmark__",
      label: def.benchmarkOverlay === "twelveSquadMedian" ? "12-Squad Median" : "Test Median",
      values,
      colours: ["#6b6a65"],
    });
  }
  return { ...base, categorySeries, categoryAxes };
}

function computeStacked(
  def: ChartDefinition,
  subjects: SubjectRecords[],
  subjectMeta: Map<string, { label: string; colours: string[] }>,
  valuesFor: (m: MetricDefinition, asPct: boolean) => Map<string, number>,
  base: ComputeChartResponse,
): ComputeChartResponse {
  const metrics = def.stackMetrics.map((id) => resolveMetric(id, def.scope));
  const stackAxes: AxisMeta[] = metrics.map((m) => axisMeta(m, false, false));
  const valueMaps = new Map(metrics.map((m) => [m.id, valuesFor(m, false)]));
  const stackSeries: StackSeries[] = subjects.map((s) => {
    const meta = subjectMeta.get(s.subjectId);
    const segments: Record<string, number> = {};
    for (const m of metrics) {
      const v = valueMaps.get(m.id)!.get(s.subjectId);
      if (v !== undefined) segments[m.id] = v;
    }
    return {
      subjectId: s.subjectId,
      label: meta?.label ?? s.subjectId,
      segments,
      colours: meta?.colours ?? ["#000000"],
    };
  });
  return { ...base, stackSeries, stackAxes };
}
