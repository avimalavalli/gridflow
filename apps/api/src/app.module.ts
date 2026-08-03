import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { TeamModule } from "./team/team.module.js";
import { AgentRunsModule } from "./agent-runs/agent-runs.module.js";
import { ContactsModule } from "./contacts/contacts.module.js";
import { OutreachModule } from "./outreach/outreach.module.js";
import { CompaniesModule } from "./companies/companies.module.js";
import { ContextModule } from "./context/context.module.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { DiscoveryBriefsModule } from "./discovery-briefs/discovery-briefs.module.js";
import { DiscoveryModule } from "./discovery/discovery.module.js";
import { HealthModule } from "./health/health.module.js";
import { OnboardingModule } from "./onboarding/onboarding.module.js";
import { MigrationModule } from "./migration/migration.module.js";
import { OpportunitiesModule } from "./opportunities/opportunities.module.js";
import { TasksModule } from "./tasks/tasks.module.js";
import { InteractionsModule } from "./interactions/interactions.module.js";
import { MeetingsModule } from "./meetings/meetings.module.js";
import { IntegrationsModule } from "./integrations/integrations.module.js";
import { OperationsModule } from "./operations/operations.module.js";
import { ReleaseAcceptanceModule } from "./release-acceptance/release-acceptance.module.js";
import { PipelinesModule } from "./pipelines/pipelines.module.js";
import { PulseModule } from "./pulse/pulse.module.js";
import { SentinelModule } from "./sentinel/sentinel.module.js";
import { NovaModule } from "./nova/nova.module.js";
import { PlatformModule } from "./platform/platform.module.js";
import { AiSettingsModule } from "./ai-settings/ai-settings.module.js";
import { OrbitModule } from "./orbit/orbit.module.js";
import { ForgeModule } from "./forge/forge.module.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    ContextModule,
    HealthModule,
    DiscoveryModule,
    OnboardingModule,
    DashboardModule,
    CompaniesModule,
    DiscoveryBriefsModule,
    MigrationModule,
    AgentRunsModule,
    ContactsModule,
    OutreachModule,
    TeamModule,
    OpportunitiesModule,
    TasksModule,
    InteractionsModule,
    MeetingsModule,
    IntegrationsModule,
    OperationsModule,
    ReleaseAcceptanceModule,
    PipelinesModule,
    PulseModule,
    SentinelModule,
    NovaModule,
    PlatformModule,
    AiSettingsModule,
    OrbitModule,
    ForgeModule,
  ],
})
export class AppModule {}
