import { Repository, databasePath } from "@ruckmetrics/store";
import { PresetStore } from "./presetStore.js";

/**
 * Server context: the singletons every procedure shares. Built once at startup
 * and injected into tRPC. Tests build their own context with an in-memory repo.
 */
export interface Context {
  repo: Repository;
  presets: PresetStore;
}

export async function createContext(): Promise<Context> {
  const repo = await Repository.open(databasePath());
  return { repo, presets: new PresetStore() };
}
