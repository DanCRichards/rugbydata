import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";

/**
 * Thin async wrapper over a DuckDB connection. Normalises the two things that
 * bite callers of the raw driver: BigInt columns (COUNT, etc.) become JS
 * numbers, and every query goes through positional ($1,$2,…) parameter binding
 * so nothing is ever string-concatenated into SQL.
 */
export class Db {
  // `instance` is retained to keep the DuckDB instance alive for the connection's
  // lifetime (it owns the underlying database handle).
  private constructor(
    readonly instance: DuckDBInstance,
    private readonly conn: DuckDBConnection,
  ) {}

  static async open(path = ":memory:"): Promise<Db> {
    const instance = await DuckDBInstance.create(path);
    const conn = await instance.connect();
    return new Db(instance, conn);
  }

  async exec(sql: string, params: unknown[] = []): Promise<void> {
    await this.conn.run(sql, params as never);
  }

  /** Run a query and return row objects with BigInt coerced to Number. */
  async all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const reader = await this.conn.run(sql, params as never);
    const rows = await reader.getRowObjects();
    return rows.map((r) => coerceRow(r)) as T[];
  }

  /** Execute multiple statements separated by semicolons (schema DDL). */
  async execScript(sql: string): Promise<void> {
    await this.conn.run(sql);
  }

  close(): void {
    // The alpha driver exposes async disconnect()/close() on the connection; the
    // instance is reclaimed by GC. Fire-and-forget for teardown.
    void this.conn.disconnect();
  }
}

function coerceRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === "bigint" ? Number(v) : v;
  }
  return out;
}
