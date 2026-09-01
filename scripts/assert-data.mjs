/**
 * Pipeline-data gate. Reads the exported payload with plain fs (NO DuckDB, so it
 * cannot itself segfault) and fails loud if the data is missing or too thin.
 *
 * This is the real quality gate for the deploy: the DuckDB-touching steps run
 * with continue-on-error because the alpha binding can segfault during process
 * teardown AFTER the data is durably written — a teardown crash must not fail the
 * deploy, but genuinely-absent data must.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const path = resolve(process.cwd(), process.argv[2] ?? "site/data.json");

let payload;
try {
  payload = JSON.parse(readFileSync(path, "utf8"));
} catch (err) {
  console.error(`assert-data: cannot read/parse ${path}: ${err.message}`);
  process.exit(1);
}

const problems = [];
if (!Array.isArray(payload.metrics) || payload.metrics.length < 40)
  problems.push(`expected >=40 metrics, got ${payload.metrics?.length}`);
if (!Array.isArray(payload.presets) || payload.presets.length !== 22)
  problems.push(`expected 22 presets, got ${payload.presets?.length}`);

const club = (payload.cohorts ?? []).find((c) => c.key === "PLAYER_CLUB:URC:2024-25");
if (!club) problems.push("missing PLAYER_CLUB:URC:2024-25 cohort");
else {
  if (club.subjects.length < 100)
    problems.push(`club cohort too thin: ${club.subjects.length} subjects (<100)`);
  const carrier = club.values?.p_defendersBeaten?.raw ?? {};
  if (Object.keys(carrier).length < 100)
    problems.push(`p_defendersBeaten has ${Object.keys(carrier).length} values (<100)`);
}
const test = (payload.cohorts ?? []).find((c) => c.scope === "TEAM_TEST");
if (!test || test.subjects.length < 5)
  problems.push(`test cohort missing or too thin: ${test?.subjects?.length}`);

if (problems.length) {
  console.error("assert-data: FAILED\n - " + problems.join("\n - "));
  process.exit(1);
}
console.log(
  `assert-data: OK — ${payload.metrics.length} metrics, ${payload.presets.length} presets, ` +
    `club ${club.subjects.length} subjects, test ${test.subjects.length} squads`,
);
