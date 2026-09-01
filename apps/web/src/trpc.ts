import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
// TYPE-ONLY import: the AppRouter type flows in for end-to-end type safety but
// no server code is bundled (the import erases at build time).
import type { AppRouter } from "@ruckmetrics/api";

/** API base URL, configurable at build/dev time; defaults to the local API. */
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/**
 * The single, fully-typed tRPC client. Calling a non-existent procedure or
 * passing a mis-shaped input is a compile error because `AppRouter` is the
 * source of truth for the whole surface.
 */
export const trpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: API_URL })],
});

/** True when the error is a transport/connection failure (API unreachable). */
export function isConnectionError(err: unknown): boolean {
  if (err instanceof TRPCClientError) {
    // A fetch failure surfaces as a TRPCClientError whose cause is a TypeError.
    const cause = (err as TRPCClientError<AppRouter>).cause;
    return cause instanceof TypeError || /fetch|network|Failed to fetch/i.test(err.message);
  }
  return err instanceof TypeError;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
