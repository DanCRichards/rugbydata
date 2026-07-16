import { describe, expect, it } from "vitest";
import { RateLimiter, type RateLimiterClock } from "./rate-limiter.js";

/** A deterministic fake clock: sleep advances virtual time and records waits. */
function fakeClock(): { clock: RateLimiterClock; sleeps: number[]; time: () => number } {
  let t = 0;
  const sleeps: number[] = [];
  return {
    sleeps,
    time: () => t,
    clock: {
      now: () => t,
      sleep: async (ms: number) => {
        sleeps.push(ms);
        t += ms;
      },
    },
  };
}

describe("RateLimiter", () => {
  it("lets the burst through immediately, then throttles at the refill rate", async () => {
    const { clock, sleeps } = fakeClock();
    const rl = new RateLimiter({ ratePerSecond: 2, burst: 2, clock });
    await rl.acquire(); // token 1 of burst
    await rl.acquire(); // token 2 of burst
    expect(sleeps).toEqual([]); // burst was free
    await rl.acquire(); // must wait for a refill (0.5s at 2/s)
    expect(sleeps).toEqual([500]);
  });

  it("honours a minimum interval between grants", async () => {
    const { clock, sleeps } = fakeClock();
    const rl = new RateLimiter({ ratePerSecond: 1000, burst: 5, minIntervalMs: 250, clock });
    await rl.acquire();
    await rl.acquire();
    await rl.acquire();
    // first was free; each subsequent grant waits the 250ms floor.
    expect(sleeps).toEqual([250, 250]);
  });

  it("rejects a non-positive rate", () => {
    expect(() => new RateLimiter({ ratePerSecond: 0 })).toThrow();
  });
});
