/**
 * A tiny token-bucket rate limiter with a minimum inter-request interval.
 *
 * It is deterministic and testable because it takes its clock and its sleep
 * function as injected dependencies — no hidden `Date.now()` / `setTimeout`.
 * In production you wire it to the real clock; in tests you drive a fake clock
 * and assert exactly how long each `acquire()` waited.
 *
 * Semantics:
 *   - The bucket holds up to `burst` tokens and refills at `ratePerSecond`.
 *   - `acquire()` consumes one token; if none are available it computes the wait
 *     until the next token, plus enough to honour `minIntervalMs` since the last
 *     grant, sleeps that long (via the injected sleeper), then grants.
 */

export interface RateLimiterClock {
  /** Current time in milliseconds (monotonic-ish; only differences are used). */
  now(): number;
  /** Resolve after roughly `ms` milliseconds. */
  sleep(ms: number): Promise<void>;
}

export interface RateLimiterOptions {
  /** Sustained requests per second (bucket refill rate). Must be > 0. */
  ratePerSecond: number;
  /** Max tokens the bucket can hold (burst capacity). Defaults to 1. */
  burst?: number;
  /** Hard floor between consecutive grants, in ms. Defaults to 0. */
  minIntervalMs?: number;
  /** Injected clock/sleeper. Defaults to the real wall clock. */
  clock?: RateLimiterClock;
}

const realClock: RateLimiterClock = {
  now: () => Date.now(),
  sleep: (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms))),
};

export class RateLimiter {
  private readonly ratePerSecond: number;
  private readonly burst: number;
  private readonly minIntervalMs: number;
  private readonly clock: RateLimiterClock;

  private tokens: number;
  private lastRefill: number;
  private lastGrant: number | null = null;
  /** Serialises overlapping acquire() calls so waits are additive, not racy. */
  private queue: Promise<void> = Promise.resolve();

  constructor(opts: RateLimiterOptions) {
    if (opts.ratePerSecond <= 0) throw new Error("ratePerSecond must be > 0");
    this.ratePerSecond = opts.ratePerSecond;
    this.burst = Math.max(1, opts.burst ?? 1);
    this.minIntervalMs = Math.max(0, opts.minIntervalMs ?? 0);
    this.clock = opts.clock ?? realClock;
    this.tokens = this.burst;
    this.lastRefill = this.clock.now();
  }

  private refill(): void {
    const now = this.clock.now();
    const elapsed = now - this.lastRefill;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.burst, this.tokens + (elapsed / 1000) * this.ratePerSecond);
    this.lastRefill = now;
  }

  /** How long the next grant must wait, in ms, given current state. */
  private computeWaitMs(): number {
    this.refill();
    let wait = 0;
    if (this.tokens < 1) {
      const deficit = 1 - this.tokens;
      wait = (deficit / this.ratePerSecond) * 1000;
    }
    if (this.lastGrant !== null) {
      const sinceLast = this.clock.now() - this.lastGrant;
      const minWait = this.minIntervalMs - sinceLast;
      if (minWait > wait) wait = minWait;
    }
    return Math.max(0, wait);
  }

  /**
   * Wait until a request may proceed, then consume a token. Concurrent callers
   * are serialised so their waits stack deterministically.
   */
  async acquire(): Promise<void> {
    const run = this.queue.then(async () => {
      const wait = this.computeWaitMs();
      if (wait > 0) await this.clock.sleep(wait);
      this.refill();
      // After sleeping, at least one token has accrued; consume it.
      this.tokens = Math.max(0, this.tokens - 1);
      this.lastGrant = this.clock.now();
    });
    // Keep the chain alive even if a caller rejects downstream of acquire.
    this.queue = run.catch(() => undefined);
    return run;
  }
}
