import { config as loadDotEnv } from "dotenv";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite, type Transaction as PGliteTransaction } from "@electric-sql/pglite";
import { Pool, type PoolClient, type QueryResult as PgQueryResult } from "pg";


const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const monorepoRoot = resolve(packageRoot, "../..");
loadDotEnv({ path: resolve(monorepoRoot, ".env"), quiet: true });

export interface SqlResult<T> {
  rows: T[];
  rowCount: number;
}

export interface SqlExecutor {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: readonly unknown[],
  ): Promise<SqlResult<T>>;
  exec(sql: string): Promise<void>;
}

export interface GridFlowDatabase extends SqlExecutor {
  transaction<T>(callback: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  kind: "pglite" | "postgres";
}

function normaliseResult<T extends Record<string, unknown>>(
  result: { rows: T[]; affectedRows?: number } | PgQueryResult<T>,
): SqlResult<T> {
  let rowCount: number;
  if ("rowCount" in result && typeof result.rowCount === "number") {
    rowCount = result.rowCount;
  } else if ("affectedRows" in result && typeof result.affectedRows === "number") {
    rowCount = result.affectedRows;
  } else {
    rowCount = result.rows.length;
  }
  return { rows: result.rows, rowCount };
}

function pgliteExecutor(db: PGlite | PGliteTransaction): SqlExecutor {
  return {
    async query<T extends Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<SqlResult<T>> {
      const result = await db.query<T>(sql, [...params]);
      return normaliseResult(result);
    },
    async exec(sql: string): Promise<void> {
      await db.exec(sql);
    },
  };
}

class PGliteDatabase implements GridFlowDatabase {
  readonly kind = "pglite" as const;
  private constructor(private readonly db: PGlite) {}

  static async create(dataDirectory: string): Promise<PGliteDatabase> {
    await mkdir(dirname(dataDirectory), { recursive: true });
    const db = new PGlite(dataDirectory);
    await db.waitReady;
    return new PGliteDatabase(db);
  }

  query<T extends Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<SqlResult<T>> {
    return pgliteExecutor(this.db).query<T>(sql, params);
  }

  async exec(sql: string): Promise<void> {
    await this.db.exec(sql);
  }

  transaction<T>(callback: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => callback(pgliteExecutor(tx)));
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

function pgExecutor(client: Pool | PoolClient): SqlExecutor {
  return {
    async query<T extends Record<string, unknown>>(
      sql: string,
      params: readonly unknown[] = [],
    ): Promise<SqlResult<T>> {
      const result = await client.query<T>(sql, [...params]);
      return normaliseResult(result);
    },
    async exec(sql: string): Promise<void> {
      await client.query(sql);
    },
  };
}

class PostgresDatabase implements GridFlowDatabase {
  readonly kind = "postgres" as const;
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 10_000,
      ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: true } : undefined,
    });
  }

  query<T extends Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<SqlResult<T>> {
    return pgExecutor(this.pool).query<T>(sql, params);
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async transaction<T>(callback: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(pgExecutor(client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? `pglite://${resolve(monorepoRoot, ".gridflow-data/postgres")}`;
}

function pglitePath(url: string): string {
  const raw = url.replace(/^pglite:\/\//, "");
  return resolve(process.cwd(), raw || "./.gridflow-data/postgres");
}

let sharedDatabase: Promise<GridFlowDatabase> | undefined;

export function createDatabase(url = databaseUrl()): Promise<GridFlowDatabase> {
  if (url.startsWith("pglite://")) {
    return PGliteDatabase.create(pglitePath(url));
  }
  if (url.startsWith("postgres://") || url.startsWith("postgresql://")) {
    return Promise.resolve(new PostgresDatabase(url));
  }
  throw new Error(
    "DATABASE_URL must start with pglite://, postgres:// or postgresql://.",
  );
}

export function getDatabase(): Promise<GridFlowDatabase> {
  sharedDatabase ??= createDatabase();
  return sharedDatabase;
}

export async function closeDatabase(): Promise<void> {
  if (sharedDatabase) {
    const database = await sharedDatabase;
    await database.close();
    sharedDatabase = undefined;
  }
}

export async function readMigrationSql(name: string): Promise<string> {
  const candidates = [
    resolve(process.cwd(), `packages/database/prisma/migrations/${name}/migration.sql`),
    resolve(process.cwd(), `prisma/migrations/${name}/migration.sql`),
  ];

  for (const path of candidates) {
    try {
      return await readFile(path, "utf8");
    } catch {
      // Try the next workspace-safe path.
    }
  }
  throw new Error(`Could not locate GridFlow migration ${name}.`);
}

export function readInitialMigration(): Promise<string> {
  return readMigrationSql("20260719000000_initial");
}
