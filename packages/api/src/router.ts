import { initTRPC, TRPCError } from "@trpc/server";
import {
  ComputeChartInput,
  ComputeChartResponse,
  FreshnessResponse,
  ListMetricsInput,
  ListPresetsResponse,
  LoadPresetInput,
  MetricsCatalog,
  Preset,
  QueryCohortInput,
  QueryCohortResponse,
  SavePresetInput,
} from "@ruckmetrics/contracts";
import { ALL_METRICS, metricsForScope } from "@ruckmetrics/registry";
import { ChartDefinitionError, computeChart } from "./compute.js";
import type { Context } from "./context.js";

const t = initTRPC.context<Context>().create();

/**
 * The typed API surface. Input AND output of every procedure is validated
 * against a contract schema, so the boundary is enforced in both directions and
 * the AppRouter type flows to the frontend for end-to-end type safety.
 */
export const appRouter = t.router({
  /** All metrics with availability (optionally filtered by scope). */
  listMetrics: t.procedure
    .input(ListMetricsInput)
    .output(MetricsCatalog)
    .query(({ input }) => ({
      metrics: input.scope ? metricsForScope(input.scope) : ALL_METRICS,
    })),

  /** Subjects available for a scope/competition/season, plus data freshness. */
  queryCohort: t.procedure
    .input(QueryCohortInput)
    .output(QueryCohortResponse)
    .query(async ({ input, ctx }) => {
      const cohort = await ctx.repo.getCohort({
        scope: input.scope,
        competition: input.competition,
        season: input.season,
      });
      const subjects =
        input.positionGroups.length === 0
          ? cohort.subjects
          : cohort.subjects.filter(
              (s) => s.positionGroup !== null && input.positionGroups.includes(s.positionGroup),
            );
      return { scope: input.scope, subjects, freshness: await ctx.repo.freshness() };
    }),

  /** THE engine endpoint: compute any chart from a chart definition. */
  computeChart: t.procedure
    .input(ComputeChartInput)
    .output(ComputeChartResponse)
    .query(async ({ input, ctx }) => {
      try {
        return await computeChart(ctx.repo, input);
      } catch (err) {
        if (err instanceof ChartDefinitionError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: err.message });
        }
        throw err;
      }
    }),

  listPresets: t.procedure
    .output(ListPresetsResponse)
    .query(({ ctx }) => ({ presets: ctx.presets.list() })),

  loadPreset: t.procedure
    .input(LoadPresetInput)
    .output(Preset)
    .query(({ input, ctx }) => {
      const preset = ctx.presets.get(input.id);
      if (!preset) throw new TRPCError({ code: "NOT_FOUND", message: `No preset ${input.id}` });
      return preset;
    }),

  savePreset: t.procedure
    .input(SavePresetInput)
    .output(Preset)
    .mutation(({ input, ctx }) => ctx.presets.save(input)),

  freshness: t.procedure
    .output(FreshnessResponse)
    .query(async ({ ctx }) => ({ entries: await ctx.repo.freshness() })),
});

export type AppRouter = typeof appRouter;
