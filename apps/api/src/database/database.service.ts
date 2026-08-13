import { Injectable, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import {
  closeDatabase,
  getDatabase,
  migrateDatabase,
  setPlatformContext,
  setTenantContext,
  type GridFlowDatabase,
  type SqlExecutor,
} from "@gridflow/database";

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  private database?: GridFlowDatabase;

  async onModuleInit(): Promise<void> {
    this.database = await getDatabase();
    await migrateDatabase(this.database);
  }

  async onApplicationShutdown(): Promise<void> {
    await closeDatabase();
  }

  private async db(): Promise<GridFlowDatabase> {
    if (!this.database) {
      this.database = await getDatabase();
      await migrateDatabase(this.database);
    }
    return this.database;
  }

  async raw(): Promise<GridFlowDatabase> {
    return this.db();
  }

  async ping(): Promise<{ database: "ok"; kind: GridFlowDatabase["kind"] }> {
    const database = await this.db();
    await database.query("SELECT 1 AS ok");
    return { database: "ok", kind: database.kind };
  }

  async securityPosture(): Promise<{ encrypted: boolean; superuser: boolean; bypassRls: boolean } | null> {
    const database = await this.db();
    if (database.kind !== "postgres") return null;
    const result = await database.query<{ encrypted: boolean; superuser: boolean; bypassRls: boolean }>(
      `SELECT
         COALESCE((SELECT s.ssl FROM pg_stat_ssl s WHERE s.pid=pg_backend_pid()),false) AS "encrypted",
         r.rolsuper AS "superuser",
         r.rolbypassrls AS "bypassRls"
       FROM pg_roles r WHERE r.rolname=current_user`,
    );
    return result.rows[0] ?? null;
  }

  async transaction<T>(callback: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const database = await this.db();
    return database.transaction(callback);
  }

  async tenantTransaction<T>(
    tenantId: string,
    callback: (tx: SqlExecutor) => Promise<T>,
  ): Promise<T> {
    return this.transaction(async (tx) => {
      await setTenantContext(tx, tenantId);
      return callback(tx);
    });
  }

  async platformTransaction<T>(callback: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    return this.transaction(async (tx) => {
      await setPlatformContext(tx);
      return callback(tx);
    });
  }
}
