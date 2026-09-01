/**
 * Deterministic pseudo-randomness for the seed generator. NEVER use unseeded
 * Math.random anywhere in ingestion — reproducibility is a hard requirement
 * (same seed => byte-identical dataset => testable).
 */

/** mulberry32: a tiny, fast, well-distributed 32-bit PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit string hash — stable across runs/platforms. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A small helper wrapping a mulberry32 stream with domain-useful draws. */
export class Rng {
  private readonly next: () => number;
  constructor(seed: number | string) {
    this.next = mulberry32(typeof seed === "string" ? hashString(seed) : seed >>> 0);
  }

  /** Uniform in [0,1). */
  float(): number {
    return this.next();
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Approx-normal draw (mean, sd) via the sum of 3 uniforms (bounded). */
  normal(mean: number, sd: number): number {
    const u = (this.next() + this.next() + this.next()) / 3; // ~N(0.5, ...)
    return mean + (u - 0.5) * 2 * Math.sqrt(3) * sd;
  }

  /** Pick an element deterministically. */
  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error("Rng.pick on empty array");
    return arr[this.int(0, arr.length - 1)]!;
  }
}

/** Round to `dp` decimal places (default 0). */
export function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/** Clamp a number into [lo, hi]. */
export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
