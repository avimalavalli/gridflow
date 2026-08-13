import type { SqlExecutor } from "./database.js";

export async function setTenantContext(
  executor: SqlExecutor,
  tenantId: string,
): Promise<void> {
  await executor.query(
    `SELECT set_config('app.current_tenant_id', $1, true)`,
    [tenantId],
  );
}

/** Explicitly marks a transaction as a cross-tenant platform operation. */
export async function setPlatformContext(executor: SqlExecutor): Promise<void> {
  await executor.query(`SELECT set_config('app.platform_operation', 'true', true)`);
}
