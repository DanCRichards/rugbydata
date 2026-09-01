/**
 * End-to-end backend verification: runs ALL 22 seed presets through the real
 * computeChart brain against the seeded DuckDB store and reports what each
 * produces. Proves the single engine drives every named analysis.
 *
 *   npx tsx scripts/verify-presets.mts
 */
import { Repository, databasePath } from "@ruckmetrics/store";
import { SEED_PRESETS } from "@ruckmetrics/registry";
import { computeChart } from "@ruckmetrics/api";

const repo = await Repository.open(databasePath());

let freeWithData = 0;
let paidWired = 0;
let problems = 0;

console.log(`\nRuckMetrics — verifying ${SEED_PRESETS.length} presets against ${databasePath()}\n`);
console.log("preset".padEnd(26), "type".padEnd(11), "points", "  notes");
console.log("-".repeat(80));

for (const p of SEED_PRESETS) {
  try {
    const res = await computeChart(repo, p.definition);
    const n =
      res.points.length ||
      res.categorySeries.length ||
      res.stackSeries.length;
    const paid = res.warnings.some((w) => w.toLowerCase().includes("paid"));
    const note = paid
      ? "PAID slot wired (awaiting feed)"
      : res.warnings.length
        ? res.warnings[0]!.slice(0, 40)
        : "";
    if (paid) paidWired += 1;
    else if (n > 0) freeWithData += 1;
    else problems += 1;
    console.log(
      p.name.padEnd(26),
      res.chartType.padEnd(11),
      String(n).padStart(4),
      "  " + note,
    );
  } catch (err) {
    problems += 1;
    console.log(p.name.padEnd(26), "ERROR".padEnd(11), "   -", "  " + (err as Error).message);
  }
}

console.log("-".repeat(80));
const fresh = await repo.freshness();
console.log(`\nData freshness:`);
for (const f of fresh) {
  console.log(
    `  ${f.source.padEnd(12)} ${String(f.scope).padEnd(12)} rows=${String(f.rowCount).padStart(5)}  newest=${f.newestFetchedAt}`,
  );
}
console.log(
  `\nSummary: ${freeWithData} free presets with data, ${paidWired} paid presets wired, ${problems} problems.`,
);
repo.close();
if (problems > 0) process.exitCode = 1;
