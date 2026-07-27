import { Repository, databasePath } from "@ruckmetrics/store";
import type { FetchQuery } from "../adapter.js";
import { defaultAdapters } from "../index.js";
import { runEtl } from "../etl.js";

/**
 * `etl` — run the real pipeline: every adapter fetches live, falling back to its
 * recorded fixture when the live source is unavailable (which, in this
 * environment, is all of them). Merges + validates + upserts into the store.
 */
async function main(): Promise<void> {
  const path = databasePath();
  console.log(`[etl] writing to ${path}`);

  const queries: FetchQuery[] = [
    { scope: "PLAYER_CLUB", competition: "URC", season: "2024-25" },
    { scope: "TEAM_TEST", competition: "NATIONS_CHAMPIONSHIP", season: "2025" },
  ];

  const repo = await Repository.open(path);
  try {
    for (const q of queries) {
      console.log(`[etl] ${q.scope} ${q.competition} ${q.season}`);
      const summary = await runEtl(q, { repo, adapters: defaultAdapters(), log: (m) => console.log(m) });
      console.log(
        `[etl]   -> ${summary.teams} teams, ${summary.players} players, ${summary.records} records`,
      );
    }
    const fresh = await repo.freshness();
    console.log("[etl] freshness by source/scope:");
    for (const f of fresh) {
      console.log(`  ${f.source} (${f.scope}): ${f.rowCount} rows, newest ${f.newestFetchedAt}`);
    }
  } finally {
    repo.close();
  }
  console.log("[etl] done.");
}

main()
  .then(() => {
    // Force a clean exit once writes are committed — see seed.ts for why.
    process.exit(0);
  })
  .catch((err) => {
    console.error("[etl] FAILED:", err);
    process.exit(1);
  });
