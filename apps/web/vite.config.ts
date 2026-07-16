import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// RuckMetrics web frontend.
// The API base URL is configurable via VITE_API_URL (default http://localhost:4000).
// Workspace packages (@ruckmetrics/contracts, @ruckmetrics/api) are consumed
// TYPE-ONLY, so no server code is bundled — the imports erase at build time.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
