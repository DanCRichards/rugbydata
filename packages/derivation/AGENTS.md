# AGENTS.md — @ruckmetrics/derivation (the pure layer)

See the root [`AGENTS.md`](../../AGENTS.md) for the full contract. Local rule, strictly enforced:

**Everything here is pure and deterministic.** Functions take data in and return numbers out.
- No I/O, no DB access, no network, no filesystem.
- No clock (`Date.now`), no randomness (`Math.random`) — output depends only on inputs.
- Never impute. Missing value for a subject → return `null` (caller excludes-with-notice).
  Malformed/contradictory data → `throw new DataIntegrityError(...)`. No zero-fill, no averages.

Every function gets a unit test in `test/` (vitest). If a change needs data access, it belongs
in the store or api layer, not here.
