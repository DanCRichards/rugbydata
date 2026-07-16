/**
 * Derivation failures are LOUD. The spec forbids silent imputation, so these
 * errors distinguish two situations:
 *
 * - DataIntegrityError: the data is malformed / self-contradictory (e.g. a rate
 *   numerator present without its denominator). This is a bug in ingestion and
 *   must never be papered over — it throws.
 *
 * - Transparent exclusion is NOT an error: when a subject simply has no data for
 *   a metric, aggregate functions return `null` and the caller surfaces a
 *   user-visible warning. That is exclusion-with-notice, not imputation.
 */
export class DataIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataIntegrityError";
  }
}
