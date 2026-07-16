import { Repository, databasePath } from "@ruckmetrics/store";
import { DEFAULT_SEED, seedDatabase } from "../seed.js";

/**
 * `seed` — generate the DETERMINISTIC demo dataset and write it to the store.
 * No network. Re-running is idempotent (deterministic ids => upsert-replace).
 */
async function main(): Promise<void> {
  const seed = parseSeedArg() ?? DEFAULT_SEED;
  const path = databasePath();
  console.log(`[seed] writing to ${path} (seed=0x${seed.toString(16)})`);

  const repo = await Repository.open(path);
  try {
    const ds = await seedDatabase(repo, seed);
    console.log(`[seed] upserted ${ds.teams.length} teams, ${ds.players.length} players, ${ds.records.length} records`);

    // Verify the data is queryable through the same Repository the API uses.
    for (const q of [
      { scope: "PLAYER_CLUB" as const, competition: "URC" as const, season: "2024-25" },
      { scope: "PLAYER_CLUB" as const, competition: "SUPER_RUGBY" as const, season: "2024-25" },
      { scope: "TEAM_TEST" as const, competition: "NATIONS_CHAMPIONSHIP" as const, season: "2025" },
    ]) {
      const cohort = await repo.getCohort(q);
      console.log(
        `[seed] cohort ${q.scope}/${q.competition}/${q.season}: ${cohort.subjects.length} subjects, ${cohort.records.length} records`,
      );
    }

    const fresh = await repo.freshness();
    console.log("[seed] freshness by source/scope:");
    for (const f of fresh) {
      console.log(`  ${f.source} (${f.scope}): ${f.rowCount} rows, newest ${f.newestFetchedAt}`);
    }
  } finally {
    repo.close();
  }
  console.log("[seed] done.");
}

function parseSeedArg(): number | null {
  const arg = process.argv.find((a) => a.startsWith("--seed="));
  if (!arg) return null;
  const n = Number(arg.slice("--seed=".length));
  if (!Number.isFinite(n)) throw new Error(`invalid --seed value: ${arg}`);
  return n >>> 0;
}

main().catch((err) => {
  console.error("[seed] FAILED:", err);
  process.exitCode = 1;
});
