import { Injectable, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import {
  closeDatabase,
  getDatabase,
  migrateDatabase,
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
}
