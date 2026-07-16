import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Preset, type Preset as PresetT } from "@ruckmetrics/contracts";
import { SEED_PRESETS } from "@ruckmetrics/registry";

/**
 * Preset persistence. The 22 seed presets are read-only and always present;
 * user-saved presets live in a JSON file so they survive restarts. listPresets
 * returns the union (user presets override a seed with the same id).
 */
export class PresetStore {
  private readonly file: string;
  private user: Map<string, PresetT>;

  constructor(file?: string) {
    this.file = file ?? resolve(process.cwd(), "data", "user-presets.json");
    this.user = this.load();
  }

  private load(): Map<string, PresetT> {
    if (!existsSync(this.file)) return new Map();
    try {
      const raw = JSON.parse(readFileSync(this.file, "utf8")) as unknown[];
      const parsed = raw.map((r) => Preset.parse(r));
      return new Map(parsed.map((p) => [p.id, p]));
    } catch {
      // A corrupt user file must not take down the API; start empty and warn.
      console.warn(`[presetStore] could not parse ${this.file}; starting with no user presets`);
      return new Map();
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify([...this.user.values()], null, 2), "utf8");
  }

  list(): PresetT[] {
    const merged = new Map<string, PresetT>();
    for (const p of SEED_PRESETS) merged.set(p.id, p);
    for (const p of this.user.values()) merged.set(p.id, p);
    return [...merged.values()];
  }

  get(id: string): PresetT | undefined {
    return this.user.get(id) ?? SEED_PRESETS.find((p) => p.id === id);
  }

  save(preset: PresetT): PresetT {
    const parsed = Preset.parse(preset);
    this.user.set(parsed.id, parsed);
    this.persist();
    return parsed;
  }
}
