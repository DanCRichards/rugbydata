import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DiskCache, cacheKey } from "./cache.js";

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), "ruck-cache-"));
}

describe("DiskCache", () => {
  it("produces stable keys for equal request descriptors", () => {
    const a = cacheKey({ source: "rugbypass", url: "x", params: { a: 1, b: 2 } });
    const b = cacheKey({ source: "rugbypass", url: "x", params: { a: 1, b: 2 } });
    const c = cacheKey({ source: "rugbypass", url: "y", params: { a: 1, b: 2 } });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("getOrSet is idempotent: produce runs once, re-runs hit cache", async () => {
    const cache = new DiskCache(tmpDir());
    const key = cacheKey({ source: "t", url: "u" });
    let calls = 0;
    const produce = async () => {
      calls++;
      return `payload-${calls}`;
    };
    const first = await cache.getOrSet(key, produce);
    const second = await cache.getOrSet(key, produce);
    expect(first).toBe("payload-1");
    expect(second).toBe("payload-1"); // cached, not re-produced
    expect(calls).toBe(1);
    expect(await cache.has(key)).toBe(true);
  });
});
