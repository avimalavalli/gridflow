-- ProductEntitlement was intentionally excluded from the broad customer-data
-- policy repair, but its original policy still referenced obsolete app.tenant_id.
-- Runtime agent execution sets app.current_tenant_id, so the stale policy hid the
-- active entitlement and blocked every pipeline before it could be created.
ALTER TABLE "ProductEntitlement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductEntitlement" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_ProductEntitlement" ON "ProductEntitlement";
CREATE POLICY "tenant_isolation_ProductEntitlement" ON "ProductEntitlement"
  USING ("tenantId" = gridflow_current_tenant_id() OR gridflow_platform_operation())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id() OR gridflow_platform_operation());
