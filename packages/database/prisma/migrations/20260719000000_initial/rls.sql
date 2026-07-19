-- GridFlow row-level tenant isolation.
-- API transactions set app.current_tenant_id before accessing tenant-owned records.

CREATE OR REPLACE FUNCTION gridflow_current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
$$;

ALTER TABLE "DriverProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DriverProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_DriverProfile" ON "DriverProfile"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "OnboardingResponse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OnboardingResponse" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_OnboardingResponse" ON "OnboardingResponse"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "OutreachPolicy" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutreachPolicy" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_OutreachPolicy" ON "OutreachPolicy"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "TargetMarket" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TargetMarket" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_TargetMarket" ON "TargetMarket"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "DiscoveryPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiscoveryPreference" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_DiscoveryPreference" ON "DiscoveryPreference"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "DiscoveryBrief" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DiscoveryBrief" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_DiscoveryBrief" ON "DiscoveryBrief"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Company" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Company" ON "Company"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contact" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Contact" ON "Contact"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "EvidenceSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EvidenceSource" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_EvidenceSource" ON "EvidenceSource"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "OutreachRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OutreachRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_OutreachRecord" ON "OutreachRecord"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "ChannelAction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChannelAction" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_ChannelAction" ON "ChannelAction"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "EmailMessage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailMessage" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_EmailMessage" ON "EmailMessage"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "SuppressionEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SuppressionEntry" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_SuppressionEntry" ON "SuppressionEntry"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "Opportunity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Opportunity" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Opportunity" ON "Opportunity"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "Interaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Interaction" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Interaction" ON "Interaction"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Task" ON "Task"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "Meeting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Meeting" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Meeting" ON "Meeting"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "Proposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Proposal" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_Proposal" ON "Proposal"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "AgentRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AgentRun" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_AgentRun" ON "AgentRun"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "AutomationJob" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationJob" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_AutomationJob" ON "AutomationJob"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "JobOutbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "JobOutbox" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_JobOutbox" ON "JobOutbox"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "PromptVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromptVersion" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_PromptVersion" ON "PromptVersion"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "StatusHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StatusHistory" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_StatusHistory" ON "StatusHistory"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_AuditLog" ON "AuditLog"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "UsageLedger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UsageLedger" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_UsageLedger" ON "UsageLedger"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "IntegrationAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "IntegrationAccount" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_IntegrationAccount" ON "IntegrationAccount"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

ALTER TABLE "LeadSource" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "LeadSource" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation_LeadSource" ON "LeadSource"
  USING ("tenantId" = gridflow_current_tenant_id())
  WITH CHECK ("tenantId" = gridflow_current_tenant_id());

