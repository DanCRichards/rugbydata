/**
 * Export a self-contained data payload for the interactive Artifact: the real
 * computed values from the seeded store, so a static HTML page can reproduce the
 * engine (axis picking, percentile toggle, position filter, benchmark) entirely
 * client-side — no server, no imputation. Only FREE/DERIVE metrics have data;
 * PAID metrics export empty, exactly as the live engine gates them.
 *
 *   npx tsx scripts/export-artifact-data.mts [outPath]   (default site/data.json)
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Repository, databasePath } from "@ruckmetrics/store";
import { ALL_METRICS, SEED_PRESETS, metricsForScope } from "@ruckmetrics/registry";
import { cohortRawValues, positionalPercentileValues } from "@ruckmetrics/derivation";
import { getMetric } from "@ruckmetrics/registry";
import type { Scope, Competition } from "@ruckmetrics/contracts";

const repo = await Repository.open(databasePath());
const lookup = (id: string) => getMetric(id);

interface CohortExport {
  key: string;
  scope: Scope;
  competition: Competition;
  season: string;
  subjects: {
    subjectId: string;
    label: string;
    teamId: string;
    positionGroup: string | null;
    matchCount: number;
  }[];
  teams: { id: string; label: string; colours: string[] }[];
  // per metric: { raw: {subjectId:value}, pct: {subjectId:value} }
  values: Record<string, { raw: Record<string, number>; pct: Record<string, number> }>;
}

const cohortDefs: { scope: Scope; competition: Competition; season: string }[] = [
  { scope: "PLAYER_CLUB", competition: "URC", season: "2024-25" },
  { scope: "PLAYER_CLUB", competition: "SUPER_RUGBY", season: "2024-25" },
  { scope: "TEAM_TEST", competition: "NATIONS_CHAMPIONSHIP", season: "2025" },
];

const cohorts: CohortExport[] = [];
const allTeams = await repo.allTeams();
const teamLabel = new Map(allTeams.map((t) => [t.id, t.name]));
const teamColours = new Map(allTeams.map((t) => [t.id, t.colours]));

for (const cd of cohortDefs) {
  const cohort = await repo.getCohort(cd);
  if (cohort.subjects.length === 0) continue;

  const subjectMeta = new Map(cohort.subjects.map((s) => [s.subjectId, s]));
  const recordsBySubject = new Map<string, typeof cohort.records>();
  for (const r of cohort.records) {
    let arr = recordsBySubject.get(r.subjectId);
    if (!arr) {
      arr = [];
      recordsBySubject.set(r.subjectId, arr);
    }
    arr.push(r);
  }
  const subjects = [...recordsBySubject.entries()].map(([subjectId, records]) => ({
    subjectId,
    positionGroup: subjectMeta.get(subjectId)?.positionGroup ?? null,
    records,
  }));

  const values: CohortExport["values"] = {};
  for (const m of metricsForScope(cd.scope)) {
    const raw = cohortRawValues(subjects, m, lookup);
    const pct = positionalPercentileValues(subjects, m, lookup);
    values[m.id] = {
      raw: Object.fromEntries(raw),
      pct: Object.fromEntries(pct),
    };
  }

  const teamIds = [...new Set(cohort.subjects.map((s) => s.teamId).filter(Boolean))];
  cohorts.push({
    key: `${cd.scope}:${cd.competition}:${cd.season}`,
    scope: cd.scope,
    competition: cd.competition,
    season: cd.season,
    subjects: cohort.subjects.map((s) => ({
      subjectId: s.subjectId,
      label: s.label,
      teamId: s.teamId,
      positionGroup: s.positionGroup,
      matchCount: s.matchCount,
    })),
    teams: teamIds.map((id) => ({
      id,
      label: teamLabel.get(id) ?? id,
      colours: teamColours.get(id) ?? ["#6b6a65"],
    })),
    values,
  });
}

const payload = {
  generatedAt: "2025-06-02T06:00:00.000Z",
  metrics: ALL_METRICS.map((m) => ({
    id: m.id,
    label: m.label,
    description: m.description,
    unit: m.unit,
    scope: m.scope,
    availability: m.availability,
    higherIsBetter: m.higherIsBetter,
    applicablePositions: m.applicablePositions,
  })),
  presets: SEED_PRESETS,
  freshness: await repo.freshness(),
  cohorts,
};

// Write the payload to a file (argv[2], default site/data.json) BEFORE any
// DuckDB teardown. The @duckdb/node-api alpha binding can segfault during native
// process teardown on some runners; writing synchronously here guarantees the
// file is complete on disk regardless, and process.exit(0) below skips the
// crash-prone finalizer once our work is durably done.
const outPath = resolve(process.cwd(), process.argv[2] ?? "site/data.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(payload));
repo.close();
process.stderr.write(`export-artifact-data: wrote ${outPath}\n`);
process.exit(0);
