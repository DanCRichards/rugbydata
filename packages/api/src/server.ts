import { createHTTPServer } from "@trpc/server/adapters/standalone";
import cors from "cors";
import { appRouter } from "./router.js";
import { createContext } from "./context.js";

/**
 * Standalone HTTP server for the tRPC API. No web framework needed — the
 * standalone adapter is enough, with CORS so the Vite dev frontend can call it.
 */
const PORT = Number(process.env.PORT ?? 4000);

async function main(): Promise<void> {
  const ctx = await createContext();
  const server = createHTTPServer({
    router: appRouter,
    middleware: cors(),
    createContext: () => ctx,
  });
  server.listen(PORT);
  console.log(`[api] RuckMetrics API listening on http://localhost:${PORT}`);
}

main().catch((err) => {
  console.error("[api] failed to start", err);
  process.exitCode = 1;
});
