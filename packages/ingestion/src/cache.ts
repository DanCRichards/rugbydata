import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Disk cache for raw fetch responses. Live adapters route every upstream request
 * through here so that:
 *   - re-running the ETL hits the cache instead of the network (idempotent), and
 *   - the exact bytes an adapter parsed are auditable on disk.
 *
 * The cache key is a stable SHA-256 of a caller-supplied request descriptor
 * (method + url + params). Same request => same key => same file.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
/** Default location: packages/ingestion/.cache */
export const DEFAULT_CACHE_DIR = resolve(HERE, "..", ".cache");

export interface CacheKeyInput {
  /** Logical namespace, usually the provenance source (e.g. "rugbypass"). */
  source: string;
  /** Request URL or dataset identifier. */
  url: string;
  /** Any extra parameters that change the response. */
  params?: Record<string, unknown>;
}

export function cacheKey(input: CacheKeyInput): string {
  const canonical = JSON.stringify({
    source: input.source,
    url: input.url,
    params: input.params ?? {},
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export class DiskCache {
  constructor(private readonly dir: string = DEFAULT_CACHE_DIR) {}

  private pathFor(key: string): string {
    return resolve(this.dir, `${key}.json`);
  }

  async has(key: string): Promise<boolean> {
    return existsSync(this.pathFor(key));
  }

  /** Return the cached raw string, or null on a miss. */
  async get(key: string): Promise<string | null> {
    const path = this.pathFor(key);
    if (!existsSync(path)) return null;
    return readFile(path, "utf8");
  }

  async set(key: string, raw: string): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    await writeFile(this.pathFor(key), raw, "utf8");
  }

  /**
   * Idempotent fetch-through: return the cached value if present, otherwise call
   * `produce()`, persist its result, and return it. Re-running with the same key
   * never calls `produce` again.
   */
  async getOrSet(key: string, produce: () => Promise<string>): Promise<string> {
    const hit = await this.get(key);
    if (hit !== null) return hit;
    const raw = await produce();
    await this.set(key, raw);
    return raw;
  }
}
