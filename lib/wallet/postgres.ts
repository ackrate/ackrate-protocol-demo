import { Pool, type PoolConfig, type QueryResultRow } from "pg";

export interface PostgresQueryable {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<ReadonlyArray<Row>>;
}

interface PoolLike {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
}

const runtime = globalThis as typeof globalThis & {
  __reappPostgresPools?: Map<string, Pool>;
};

runtime.__reappPostgresPools ??= new Map();

function validateDatabaseUrl(databaseUrl: string): void {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL");
  }
  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:")
    || !url.username
    || !url.hostname
    || !url.pathname
  ) {
    throw new Error("DATABASE_URL must be a credentialed PostgreSQL URL");
  }
}

function poolFor(databaseUrl: string): Pool {
  const existing = runtime.__reappPostgresPools!.get(databaseUrl);
  if (existing) return existing;
  const config: PoolConfig = {
    connectionString: databaseUrl,
    application_name: "reapp-protocol-live",
    max: 4,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    query_timeout: 15_000,
    statement_timeout: 15_000,
    allowExitOnIdle: true,
  };
  const pool = new Pool(config);
  pool.on("error", (error) => {
    console.error("PostgreSQL idle client error", { code: "code" in error ? error.code : "unknown" });
  });
  runtime.__reappPostgresPools!.set(databaseUrl, pool);
  return pool;
}

export function createPostgresClient(databaseUrl: string, provided?: PoolLike): PostgresQueryable {
  validateDatabaseUrl(databaseUrl);
  const pool = provided ?? poolFor(databaseUrl);
  return {
    async query<Row extends QueryResultRow = QueryResultRow>(text: string, values?: readonly unknown[]) {
      const result = await pool.query<Row>(text, values ? [...values] : undefined);
      return result.rows;
    },
  };
}

export async function verifyPostgres(databaseUrl: string): Promise<void> {
  const rows = await createPostgresClient(databaseUrl).query<{ ok: number }>("SELECT 1 AS ok");
  if (rows.length !== 1 || Number(rows[0]?.ok) !== 1) {
    throw new Error("PostgreSQL readiness check returned an invalid result");
  }
}
