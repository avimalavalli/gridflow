-- GridFlow initial PostgreSQL schema.
-- Generated deterministically from prisma/schema.prisma.
-- Do not hand-edit this file without also updating the Prisma schema.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE "OrganisationType" AS ENUM (
  'DRIVER',
  'TEAM',
  'AGENCY',
  'COMMERCIAL_ORGANISATION'
);

CREATE TYPE "MembershipRole" AS ENUM (
  'OWNER',
  'ADMIN',
  'COMMERCIAL_OPERATOR',
  'REVIEWER',
  'READ_ONLY'
);

CREATE TYPE "UserStatus" AS ENUM (
  'ACTIVE',
  'INVITED',
  'SUSPENDED'
);

CREATE TYPE "OnboardingStatus" AS ENUM (
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED'
);

CREATE TYPE "OutreachStrategy" AS ENUM (
  'LINKEDIN_FIRST',
  'EMAIL_FIRST',
  'PARALLEL',
  'MANUAL',
  'CUSTOM'
);

CREATE TYPE "EmailAutomationMode" AS ENUM (
  'MANUAL',
  'DRAFT_ONLY',
  'APPROVED_AUTOMATIC',
  'FULL_AUTOMATION'
);

CREATE TYPE "ApprovalMode" AS ENUM (
  'EVERY_MESSAGE',
  'INITIAL_ONLY',
  'HIGH_VALUE_ONLY',
  'NONE'
);

CREATE TYPE "TargetMarketType" AS ENUM (
  'HOME',
  'COMPETITION',
  'AUDIENCE',
  'EXPANSION',
  'SPONSOR_TARGET'
);

CREATE TYPE "DiscoveryBriefStatus" AS ENUM (
  'NEVER_RUN',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'PAUSED'
);

CREATE TYPE "ResearchStatus" AS ENUM (
  'UNRESEARCHED',
  'RESEARCHING',
  'RESEARCHED',
  'NEED_REVIEW'
);

CREATE TYPE "ContactDiscoveryStatus" AS ENUM (
  'NOT_STARTED',
  'SEARCHING',
  'CONTACTS_FOUND',
  'NEEDS_MANUAL_SEARCH'
);

CREATE TYPE "CommercialStage" AS ENUM (
  'DISCOVERED',
  'QUALIFIED',
  'OUTREACH',
  'CONVERSATION',
  'OPPORTUNITY',
  'WON',
  'LOST',
  'PAUSED'
);

CREATE TYPE "Priority" AS ENUM (
  'HIGH',
  'MEDIUM',
  'LOW'
);

CREATE TYPE "ContactStatus" AS ENUM (
  'NOT_CONTACTED',
  'CONTACTED',
  'REPLIED',
  'MEETING_SCHEDULED',
  'ACTIVE_CONVERSATION',
  'UNRESPONSIVE'
);

CREATE TYPE "Department" AS ENUM (
  'PARTNERSHIPS',
  'MARKETING',
  'COMMERCIAL',
  'SALES',
  'EXECUTIVE',
  'MANAGEMENT',
  'OTHER'
);

CREATE TYPE "VerificationStatus" AS ENUM (
  'UNVERIFIED',
  'PUBLICLY_LISTED',
  'EMAIL_VERIFIED',
  'OUTDATED'
);

CREATE TYPE "ContactPriority" AS ENUM (
  'PRIMARY',
  'SECONDARY',
  'BACKUP'
);

CREATE TYPE "PreferredChannel" AS ENUM (
  'EMAIL',
  'LINKEDIN',
  'PHONE',
  'EMAIL_AND_LINKEDIN',
  'UNKNOWN'
);

CREATE TYPE "EchoStatus" AS ENUM (
  'NOT_STARTED',
  'QUEUED',
  'DRAFTING',
  'DRAFT_READY',
  'APPROVED',
  'SENT',
  'PAUSED',
  'FAILED'
);

CREATE TYPE "DraftStatus" AS ENUM (
  'NOT_STARTED',
  'GENERATING',
  'DRAFT_READY',
  'NEEDS_REVISION',
  'APPROVED',
  'SENT',
  'FAILED'
);

CREATE TYPE "ApprovalStatus" AS ENUM (
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'NEEDS_CHANGES'
);

CREATE TYPE "LinkedInStatus" AS ENUM (
  'NOT_STARTED',
  'CONNECTION_SENT',
  'ACCEPTED',
  'FOLLOW_UP_SENT',
  'REPLIED',
  'NO_RESPONSE',
  'PAUSED',
  'NOT_INTERESTED'
);

CREATE TYPE "EmailStatus" AS ENUM (
  'NOT_STARTED',
  'DRAFT_CREATED',
  'QUEUED',
  'SENT',
  'REPLIED',
  'PAUSED',
  'FAILED',
  'BOUNCED',
  'SUPPRESSED'
);

CREATE TYPE "AgentName" AS ENUM (
  'ATLAS',
  'SAGE',
  'RELAY',
  'ECHO',
  'PULSE',
  'SENTINEL',
  'NOVA',
  'FORGE',
  'SEAL',
  'ORBIT',
  'BEACON',
  'LEDGER',
  'CONTROL',
  'THROTTLE'
);

CREATE TYPE "AgentRunStatus" AS ENUM (
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE "AutomationJobStatus" AS ENUM (
  'QUEUED',
  'DISPATCHED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'DEAD_LETTER'
);

CREATE TYPE "SourceType" AS ENUM (
  'PUBLIC_WEB',
  'COMPANY_WEBSITE',
  'LINKEDIN',
  'GOOGLE_SEARCH',
  'REFERRAL',
  'TRADE_SHOW',
  'INDUSTRY_ASSOCIATION',
  'EXISTING_SPONSOR',
  'APOLLO',
  'CLAY',
  'PERSONAL_NETWORK',
  'MANUAL',
  'AIRTABLE_MIGRATION',
  'AI_GENERATED',
  'SYSTEM_GENERATED',
  'GMAIL'
);

CREATE TYPE "ChannelType" AS ENUM (
  'LINKEDIN',
  'EMAIL',
  'PHONE'
);

CREATE TYPE "ChannelActionStatus" AS ENUM (
  'NOT_STARTED',
  'READY',
  'QUEUED',
  'SENT',
  'ACCEPTED',
  'FOLLOW_UP_DUE',
  'REPLIED',
  'NO_RESPONSE',
  'PAUSED',
  'FAILED',
  'NOT_INTERESTED',
  'BOUNCED',
  'SUPPRESSED'
);

CREATE TYPE "InteractionDirection" AS ENUM (
  'INBOUND',
  'OUTBOUND',
  'INTERNAL'
);

CREATE TYPE "OpportunityStage" AS ENUM (
  'INTERESTED',
  'DISCOVERY_CALL',
  'NEEDS_ANALYSIS',
  'PROPOSAL_REQUESTED',
  'PROPOSAL_SENT',
  'NEGOTIATION',
  'VERBAL_AGREEMENT',
  'WON',
  'LOST',
  'ON_HOLD'
);

CREATE TYPE "TaskStatus" AS ENUM (
  'OPEN',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED'
);

CREATE TYPE "TaskType" AS ENUM (
  'MANUAL_ACTION',
  'LINKEDIN_ACTION',
  'EMAIL_ACTION',
  'FOLLOW_UP',
  'MEETING_PREP',
  'PROPOSAL',
  'DATA_REVIEW',
  'AUTOMATION_RETRY'
);

CREATE TYPE "IntegrationProvider" AS ENUM (
  'GMAIL',
  'GOOGLE_CALENDAR',
  'OPENAI',
  'SEARCH_PROVIDER',
  'SLACK',
  'WHATSAPP'
);

CREATE TYPE "IntegrationStatus" AS ENUM (
  'DISCONNECTED',
  'CONNECTED',
  'EXPIRED',
  'ERROR'
);

CREATE TYPE "SuppressionReason" AS ENUM (
  'OPT_OUT',
  'BOUNCED',
  'INVALID_ADDRESS',
  'USER_SUPPRESSED',
  'LEGAL_RESTRICTION',
  'ACTIVE_CONVERSATION'
);

CREATE TYPE "AuditAction" AS ENUM (
  'CREATE',
  'UPDATE',
  'DELETE',
  'STATUS_CHANGE',
  'APPROVE',
  'REJECT',
  'LOGIN',
  'LOGOUT',
  'INTEGRATION_CONNECT',
  'INTEGRATION_DISCONNECT',
  'AUTOMATION_RUN',
  'EMAIL_SEND'
);

CREATE TABLE "User" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "UserStatus" DEFAULT 'ACTIVE'::"UserStatus" NOT NULL,
  "emailVerifiedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Organisation" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "type" "OrganisationType" DEFAULT 'DRIVER'::"OrganisationType" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrganisationMembership" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "organisationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "role" "MembershipRole" DEFAULT 'COMMERCIAL_OPERATOR'::"MembershipRole" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "OrganisationMembership_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "userId" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "revokedAt" TIMESTAMPTZ(3),
  "userAgent" TEXT,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DriverProfile" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "athleteName" TEXT,
  "sport" TEXT,
  "currentSeries" TEXT,
  "currentTeam" TEXT,
  "competitionLevel" TEXT,
  "nationality" TEXT,
  "countryOfResidence" TEXT,
  "homeRegion" TEXT,
  "racingHistory" TEXT,
  "achievements" TEXT,
  "currentProgramme" TEXT,
  "futureGoals" TEXT,
  "personalStory" TEXT,
  "differentiators" TEXT,
  "sponsorshipTargetMinor" INTEGER,
  "minimumDealMinor" INTEGER,
  "maximumDealMinor" INTEGER,
  "currency" TEXT DEFAULT 'GBP' NOT NULL,
  "fundingDeadline" TIMESTAMPTZ(3),
  "existingSponsors" JSONB,
  "excludedBrands" JSONB,
  "audienceSummary" TEXT,
  "audienceGeography" JSONB,
  "socialProfiles" JSONB,
  "sponsorshipInventory" JSONB,
  "tone" TEXT,
  "preferredLanguages" JSONB,
  "onboardingStatus" "OnboardingStatus" DEFAULT 'NOT_STARTED'::"OnboardingStatus" NOT NULL,
  "profileVersion" INTEGER DEFAULT 1 NOT NULL,
  "source" "SourceType" DEFAULT 'MANUAL'::"SourceType" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "DriverProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OnboardingResponse" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "version" INTEGER DEFAULT 1 NOT NULL,
  "responses" JSONB NOT NULL,
  "completedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "OnboardingResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutreachPolicy" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "strategy" "OutreachStrategy" DEFAULT 'LINKEDIN_FIRST'::"OutreachStrategy" NOT NULL,
  "emailAutomationMode" "EmailAutomationMode" DEFAULT 'APPROVED_AUTOMATIC'::"EmailAutomationMode" NOT NULL,
  "approvalMode" "ApprovalMode" DEFAULT 'EVERY_MESSAGE'::"ApprovalMode" NOT NULL,
  "dailyEmailLimit" INTEGER DEFAULT 20 NOT NULL,
  "allowedSendingDays" JSONB DEFAULT '[1,2,3,4,5]'::JSONB NOT NULL,
  "sendingWindowStart" TEXT DEFAULT '09:00' NOT NULL,
  "sendingWindowEnd" TEXT DEFAULT '17:00' NOT NULL,
  "timezone" TEXT DEFAULT 'UTC' NOT NULL,
  "delayBetweenMessagesSeconds" INTEGER DEFAULT 120 NOT NULL,
  "emailFollowUpCount" INTEGER DEFAULT 2 NOT NULL,
  "firstFollowUpDelayDays" INTEGER DEFAULT 5 NOT NULL,
  "secondFollowUpDelayDays" INTEGER DEFAULT 7 NOT NULL,
  "linkedinAcceptanceDelayDays" INTEGER DEFAULT 1 NOT NULL,
  "linkedinNoResponseDelayDays" INTEGER DEFAULT 5 NOT NULL,
  "stopOnReply" BOOLEAN DEFAULT true NOT NULL,
  "stopOnMeeting" BOOLEAN DEFAULT true NOT NULL,
  "stopOnOptOut" BOOLEAN DEFAULT true NOT NULL,
  "simultaneousCompanyContacts" INTEGER DEFAULT 1 NOT NULL,
  "highValueApprovalMinor" INTEGER,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "OutreachPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TargetMarket" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "country" TEXT NOT NULL,
  "region" TEXT DEFAULT '' NOT NULL,
  "type" "TargetMarketType" NOT NULL,
  "priority" INTEGER DEFAULT 3 NOT NULL,
  "rationale" TEXT,
  "active" BOOLEAN DEFAULT true NOT NULL,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "TargetMarket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscoveryPreference" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "preferredIndustries" JSONB,
  "excludedIndustries" JSONB,
  "preferredCompanySizes" JSONB,
  "preferredCompanyTypes" JSONB,
  "b2bPreference" TEXT,
  "localRegionalGlobal" TEXT,
  "existingSponsorConflicts" JSONB,
  "realisticTargetRule" TEXT,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "DiscoveryPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DiscoveryBrief" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "briefName" TEXT NOT NULL,
  "active" BOOLEAN DEFAULT false NOT NULL,
  "region" TEXT NOT NULL,
  "industryFocus" TEXT NOT NULL,
  "searchTheme" TEXT NOT NULL,
  "companiesPerRun" INTEGER DEFAULT 5 NOT NULL,
  "lastRunAt" TIMESTAMPTZ(3),
  "lastRunStatus" "DiscoveryBriefStatus" DEFAULT 'NEVER_RUN'::"DiscoveryBriefStatus" NOT NULL,
  "lastResultCount" INTEGER DEFAULT 0 NOT NULL,
  "atlasNotes" TEXT,
  "notes" TEXT,
  "generatedFromOnboarding" BOOLEAN DEFAULT false NOT NULL,
  "generationReason" TEXT,
  "driverProfileVersion" INTEGER,
  "geographicalRationale" TEXT,
  "source" "SourceType" DEFAULT 'MANUAL'::"SourceType" NOT NULL,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "DiscoveryBrief_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Company" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyName" TEXT NOT NULL,
  "industries" TEXT,
  "country" TEXT,
  "website" TEXT NOT NULL,
  "companyDomain" TEXT NOT NULL,
  "companyKey" TEXT NOT NULL,
  "linkedinCompanyUrl" TEXT,
  "companySize" TEXT,
  "currentStage" "CommercialStage" DEFAULT 'DISCOVERED'::"CommercialStage" NOT NULL,
  "priority" "Priority",
  "nextFollowUpAt" TIMESTAMPTZ(3),
  "lastContactAt" TIMESTAMPTZ(3),
  "companyOwnerId" UUID,
  "researchStatus" "ResearchStatus" DEFAULT 'UNRESEARCHED'::"ResearchStatus" NOT NULL,
  "researchNotes" TEXT,
  "partnershipAngle" TEXT,
  "recommendedContactRoles" TEXT,
  "lastResearchedAt" TIMESTAMPTZ(3),
  "contactDiscoveryStatus" "ContactDiscoveryStatus" DEFAULT 'NOT_STARTED'::"ContactDiscoveryStatus" NOT NULL,
  "contactDiscoveryNotes" TEXT,
  "lastContactSearchAt" TIMESTAMPTZ(3),
  "contactsFoundCount" INTEGER DEFAULT 0 NOT NULL,
  "discoveryRationale" TEXT,
  "discoveryEvidence" TEXT,
  "discoveryBriefId" UUID,
  "atlasDiscoveredAt" TIMESTAMPTZ(3),
  "confidence" DOUBLE PRECISION,
  "evidenceCompleteness" DOUBLE PRECISION,
  "source" "SourceType" DEFAULT 'MANUAL'::"SourceType" NOT NULL,
  "legacyId" TEXT,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyScore" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "companyId" UUID NOT NULL,
  "budgetPotential" INTEGER NOT NULL,
  "strategicFit" INTEGER NOT NULL,
  "geographicalFit" INTEGER NOT NULL,
  "motorsportRelevance" INTEGER NOT NULL,
  "marketingActivity" INTEGER NOT NULL,
  "decisionMakerAccess" INTEGER NOT NULL,
  "timingScore" INTEGER NOT NULL,
  "commercialScore" INTEGER NOT NULL,
  "scoringVersion" INTEGER DEFAULT 1 NOT NULL,
  "explanation" JSONB,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CompanyScore_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Contact" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "contactName" TEXT NOT NULL,
  "jobTitle" TEXT NOT NULL,
  "department" "Department" DEFAULT 'OTHER'::"Department" NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "linkedinProfileUrl" TEXT,
  "status" "ContactStatus" DEFAULT 'NOT_CONTACTED'::"ContactStatus" NOT NULL,
  "lastContactAt" TIMESTAMPTZ(3),
  "nextFollowUpAt" TIMESTAMPTZ(3),
  "notes" TEXT,
  "verificationStatus" "VerificationStatus" DEFAULT 'UNVERIFIED'::"VerificationStatus" NOT NULL,
  "lastVerifiedAt" TIMESTAMPTZ(3),
  "externalPersonId" TEXT,
  "contactPriority" "ContactPriority" DEFAULT 'BACKUP'::"ContactPriority" NOT NULL,
  "discoverySource" "SourceType" DEFAULT 'PUBLIC_WEB'::"SourceType" NOT NULL,
  "contactKey" TEXT NOT NULL,
  "echoStatus" "EchoStatus" DEFAULT 'NOT_STARTED'::"EchoStatus" NOT NULL,
  "preferredChannel" "PreferredChannel" DEFAULT 'UNKNOWN'::"PreferredChannel" NOT NULL,
  "confidence" DOUBLE PRECISION,
  "evidenceCompleteness" DOUBLE PRECISION,
  "source" "SourceType" DEFAULT 'MANUAL'::"SourceType" NOT NULL,
  "legacyId" TEXT,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EvidenceSource" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "title" TEXT,
  "extractedFact" TEXT NOT NULL,
  "retrievedAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "sourceType" "SourceType" NOT NULL,
  "confidence" DOUBLE PRECISION,
  "contentHash" TEXT,
  "sourceProvider" TEXT,
  "agentRunId" UUID,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "EvidenceSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyEvidence" (
  "companyId" UUID NOT NULL,
  "evidenceId" UUID NOT NULL,
  "claimKey" TEXT,
  CONSTRAINT "CompanyEvidence_pkey" PRIMARY KEY ("companyId", "evidenceId")
);

CREATE TABLE "ContactEvidence" (
  "contactId" UUID NOT NULL,
  "evidenceId" UUID NOT NULL,
  "claimKey" TEXT,
  CONSTRAINT "ContactEvidence_pkey" PRIMARY KEY ("contactId", "evidenceId")
);

CREATE TABLE "OutreachRecord" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "contactId" UUID NOT NULL,
  "opportunityId" UUID,
  "outreachName" TEXT NOT NULL,
  "outreachKey" TEXT NOT NULL,
  "sequence" TEXT DEFAULT 'initial-v1' NOT NULL,
  "echoStatus" "EchoStatus" DEFAULT 'NOT_STARTED'::"EchoStatus" NOT NULL,
  "draftStatus" "DraftStatus" DEFAULT 'NOT_STARTED'::"DraftStatus" NOT NULL,
  "approvalStatus" "ApprovalStatus" DEFAULT 'PENDING_REVIEW'::"ApprovalStatus" NOT NULL,
  "linkedinStatus" "LinkedInStatus" DEFAULT 'NOT_STARTED'::"LinkedInStatus" NOT NULL,
  "emailStatus" "EmailStatus" DEFAULT 'NOT_STARTED'::"EmailStatus" NOT NULL,
  "currentVersionId" UUID,
  "generatedAt" TIMESTAMPTZ(3),
  "sentAt" TIMESTAMPTZ(3),
  "nextFollowUpAt" TIMESTAMPTZ(3),
  "notes" TEXT,
  "source" "SourceType" DEFAULT 'AI_GENERATED'::"SourceType" NOT NULL,
  "legacyId" TEXT,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "OutreachRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutreachVersion" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "outreachRecordId" UUID NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "linkedinConnectionNote" TEXT,
  "linkedinFollowUpMessage" TEXT,
  "emailSubject" TEXT,
  "emailBody" TEXT,
  "followUpEmail1" TEXT,
  "followUpEmail2" TEXT,
  "callOpener" TEXT NOT NULL,
  "personalisationEvidence" TEXT NOT NULL,
  "partnershipPitch" TEXT NOT NULL,
  "generationNotes" TEXT,
  "promptVersion" TEXT NOT NULL,
  "modelUsed" TEXT NOT NULL,
  "generatedAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "OutreachVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OutreachEvidence" (
  "outreachVersionId" UUID NOT NULL,
  "evidenceId" UUID NOT NULL,
  "claimKey" TEXT,
  CONSTRAINT "OutreachEvidence_pkey" PRIMARY KEY ("outreachVersionId", "evidenceId")
);

CREATE TABLE "ApprovalEvent" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "outreachRecordId" UUID NOT NULL,
  "outreachVersionId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "decision" "ApprovalStatus" NOT NULL,
  "comments" TEXT,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "ApprovalEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChannelAction" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "outreachRecordId" UUID NOT NULL,
  "outreachVersionId" UUID,
  "contactId" UUID NOT NULL,
  "channel" "ChannelType" NOT NULL,
  "sequenceStep" TEXT NOT NULL,
  "status" "ChannelActionStatus" DEFAULT 'NOT_STARTED'::"ChannelActionStatus" NOT NULL,
  "dueAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "automated" BOOLEAN DEFAULT false NOT NULL,
  "providerMessageId" TEXT,
  "providerThreadId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "errorDetails" TEXT,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ChannelAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailMessage" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "outreachRecordId" UUID,
  "outreachVersionId" UUID,
  "contactId" UUID,
  "providerMessageId" TEXT NOT NULL,
  "providerThreadId" TEXT,
  "recipient" TEXT NOT NULL,
  "sender" TEXT,
  "subject" TEXT NOT NULL,
  "direction" "InteractionDirection" NOT NULL,
  "status" "EmailStatus" NOT NULL,
  "sentAt" TIMESTAMPTZ(3),
  "receivedAt" TIMESTAMPTZ(3),
  "headers" JSONB,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SuppressionEntry" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "email" TEXT,
  "contactKey" TEXT,
  "companyKey" TEXT,
  "reason" "SuppressionReason" NOT NULL,
  "notes" TEXT,
  "createdById" UUID,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "SuppressionEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Opportunity" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "primaryContactId" UUID,
  "opportunityName" TEXT NOT NULL,
  "opportunityType" TEXT,
  "valueMinor" INTEGER,
  "currency" TEXT DEFAULT 'GBP' NOT NULL,
  "stage" "OpportunityStage" DEFAULT 'INTERESTED'::"OpportunityStage" NOT NULL,
  "probability" INTEGER DEFAULT 10 NOT NULL,
  "expectedCloseDate" DATE,
  "notes" TEXT,
  "source" "SourceType" DEFAULT 'MANUAL'::"SourceType" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Interaction" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID,
  "contactId" UUID,
  "outreachRecordId" UUID,
  "opportunityId" UUID,
  "channel" "ChannelType",
  "direction" "InteractionDirection" NOT NULL,
  "summary" TEXT NOT NULL,
  "outcome" TEXT,
  "providerMessageId" TEXT,
  "providerThreadId" TEXT,
  "occurredAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "source" "SourceType" DEFAULT 'MANUAL'::"SourceType" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "Interaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Task" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID,
  "contactId" UUID,
  "opportunityId" UUID,
  "ownerId" UUID,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "type" "TaskType" DEFAULT 'MANUAL_ACTION'::"TaskType" NOT NULL,
  "status" "TaskStatus" DEFAULT 'OPEN'::"TaskStatus" NOT NULL,
  "dueAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "source" "SourceType" DEFAULT 'MANUAL'::"SourceType" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Meeting" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID,
  "contactId" UUID,
  "opportunityId" UUID,
  "title" TEXT NOT NULL,
  "startsAt" TIMESTAMPTZ(3) NOT NULL,
  "endsAt" TIMESTAMPTZ(3),
  "attendees" JSONB,
  "agenda" TEXT,
  "preparation" TEXT,
  "notes" TEXT,
  "outcome" TEXT,
  "nextAction" TEXT,
  "calendarEventId" TEXT,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Proposal" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "opportunityId" UUID,
  "title" TEXT NOT NULL,
  "status" TEXT DEFAULT 'DRAFT' NOT NULL,
  "currentVersionId" UUID,
  "sentAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProposalVersion" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "proposalId" UUID NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "content" JSONB NOT NULL,
  "fileObjectKey" TEXT,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "ProposalVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentRun" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "agentName" "AgentName" NOT NULL,
  "status" "AgentRunStatus" DEFAULT 'QUEUED'::"AgentRunStatus" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "input" JSONB NOT NULL,
  "output" JSONB,
  "promptVersion" TEXT,
  "modelUsed" TEXT,
  "startedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "heartbeatAt" TIMESTAMPTZ(3),
  "errorCode" TEXT,
  "errorDetails" TEXT,
  "retryCount" INTEGER DEFAULT 0 NOT NULL,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "totalTokens" INTEGER,
  "estimatedCostUsd" DECIMAL(12,6),
  "discoveryBriefId" UUID,
  "companyId" UUID,
  "contactId" UUID,
  "outreachRecordId" UUID,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationJob" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "agentRunId" UUID,
  "queueName" TEXT NOT NULL,
  "jobName" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "result" JSONB,
  "status" "AutomationJobStatus" DEFAULT 'QUEUED'::"AutomationJobStatus" NOT NULL,
  "attempts" INTEGER DEFAULT 0 NOT NULL,
  "maxAttempts" INTEGER DEFAULT 3 NOT NULL,
  "scheduledFor" TIMESTAMPTZ(3),
  "startedAt" TIMESTAMPTZ(3),
  "completedAt" TIMESTAMPTZ(3),
  "heartbeatAt" TIMESTAMPTZ(3),
  "errorDetails" TEXT,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AutomationJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "JobOutbox" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "queueName" TEXT NOT NULL,
  "jobName" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "result" JSONB,
  "status" "AutomationJobStatus" DEFAULT 'QUEUED'::"AutomationJobStatus" NOT NULL,
  "dispatchedAt" TIMESTAMPTZ(3),
  "errorDetails" TEXT,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "JobOutbox_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromptVersion" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "agentName" "AgentName" NOT NULL,
  "version" TEXT NOT NULL,
  "template" TEXT NOT NULL,
  "inputSchema" JSONB NOT NULL,
  "outputSchema" JSONB NOT NULL,
  "active" BOOLEAN DEFAULT false NOT NULL,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "PromptVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StatusHistory" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" UUID NOT NULL,
  "fieldName" TEXT NOT NULL,
  "oldValue" TEXT,
  "newValue" TEXT,
  "actorUserId" UUID,
  "agentRunId" UUID,
  "reason" TEXT,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "StatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "userId" UUID,
  "action" "AuditAction" NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "oldValues" JSONB,
  "newValues" JSONB,
  "metadata" JSONB,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsageLedger" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "operation" TEXT NOT NULL,
  "agentName" "AgentName",
  "inputUnits" INTEGER,
  "outputUnits" INTEGER,
  "requestCount" INTEGER DEFAULT 1 NOT NULL,
  "estimatedCostUsd" DECIMAL(12,6),
  "occurredAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "metadata" JSONB,
  CONSTRAINT "UsageLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationAccount" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "status" "IntegrationStatus" DEFAULT 'DISCONNECTED'::"IntegrationStatus" NOT NULL,
  "externalAccountId" TEXT,
  "externalEmail" TEXT,
  "encryptedAccessToken" TEXT,
  "encryptedRefreshToken" TEXT,
  "tokenExpiresAt" TIMESTAMPTZ(3),
  "scopes" JSONB,
  "metadata" JSONB,
  "lastSyncedAt" TIMESTAMPTZ(3),
  "errorDetails" TEXT,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "IntegrationAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeadSource" (
  "id" UUID DEFAULT gen_random_uuid() NOT NULL,
  "tenantId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "sourceType" "SourceType" NOT NULL,
  "createdAt" TIMESTAMPTZ(3) DEFAULT CURRENT_TIMESTAMP NOT NULL,
  CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CompanyLeadSource" (
  "companyId" UUID NOT NULL,
  "leadSourceId" UUID NOT NULL,
  CONSTRAINT "CompanyLeadSource_pkey" PRIMARY KEY ("companyId", "leadSourceId")
);

ALTER TABLE "OrganisationMembership" ADD CONSTRAINT "OrganisationMembership_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganisationMembership" ADD CONSTRAINT "OrganisationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OnboardingResponse" ADD CONSTRAINT "OnboardingResponse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutreachPolicy" ADD CONSTRAINT "OutreachPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TargetMarket" ADD CONSTRAINT "TargetMarket_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscoveryPreference" ADD CONSTRAINT "DiscoveryPreference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DiscoveryBrief" ADD CONSTRAINT "DiscoveryBrief_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Company" ADD CONSTRAINT "Company_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Company" ADD CONSTRAINT "Company_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Company" ADD CONSTRAINT "Company_discoveryBriefId_fkey" FOREIGN KEY ("discoveryBriefId") REFERENCES "DiscoveryBrief" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyScore" ADD CONSTRAINT "CompanyScore_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EvidenceSource" ADD CONSTRAINT "EvidenceSource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceSource" ADD CONSTRAINT "EvidenceSource_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CompanyEvidence" ADD CONSTRAINT "CompanyEvidence_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyEvidence" ADD CONSTRAINT "CompanyEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "EvidenceSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactEvidence" ADD CONSTRAINT "ContactEvidence_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContactEvidence" ADD CONSTRAINT "ContactEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "EvidenceSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutreachRecord" ADD CONSTRAINT "OutreachRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutreachRecord" ADD CONSTRAINT "OutreachRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutreachRecord" ADD CONSTRAINT "OutreachRecord_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutreachRecord" ADD CONSTRAINT "OutreachRecord_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutreachRecord" ADD CONSTRAINT "OutreachRecord_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "OutreachVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OutreachVersion" ADD CONSTRAINT "OutreachVersion_outreachRecordId_fkey" FOREIGN KEY ("outreachRecordId") REFERENCES "OutreachRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutreachEvidence" ADD CONSTRAINT "OutreachEvidence_outreachVersionId_fkey" FOREIGN KEY ("outreachVersionId") REFERENCES "OutreachVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutreachEvidence" ADD CONSTRAINT "OutreachEvidence_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "EvidenceSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_outreachRecordId_fkey" FOREIGN KEY ("outreachRecordId") REFERENCES "OutreachRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_outreachVersionId_fkey" FOREIGN KEY ("outreachVersionId") REFERENCES "OutreachVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ApprovalEvent" ADD CONSTRAINT "ApprovalEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ChannelAction" ADD CONSTRAINT "ChannelAction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelAction" ADD CONSTRAINT "ChannelAction_outreachRecordId_fkey" FOREIGN KEY ("outreachRecordId") REFERENCES "OutreachRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelAction" ADD CONSTRAINT "ChannelAction_outreachVersionId_fkey" FOREIGN KEY ("outreachVersionId") REFERENCES "OutreachVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ChannelAction" ADD CONSTRAINT "ChannelAction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_outreachRecordId_fkey" FOREIGN KEY ("outreachRecordId") REFERENCES "OutreachRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_outreachVersionId_fkey" FOREIGN KEY ("outreachVersionId") REFERENCES "OutreachVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SuppressionEntry" ADD CONSTRAINT "SuppressionEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_primaryContactId_fkey" FOREIGN KEY ("primaryContactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_outreachRecordId_fkey" FOREIGN KEY ("outreachRecordId") REFERENCES "OutreachRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Interaction" ADD CONSTRAINT "Interaction_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ProposalVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProposalVersion" ADD CONSTRAINT "ProposalVersion_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_discoveryBriefId_fkey" FOREIGN KEY ("discoveryBriefId") REFERENCES "DiscoveryBrief" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_outreachRecordId_fkey" FOREIGN KEY ("outreachRecordId") REFERENCES "OutreachRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationJob" ADD CONSTRAINT "AutomationJob_agentRunId_fkey" FOREIGN KEY ("agentRunId") REFERENCES "AgentRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "JobOutbox" ADD CONSTRAINT "JobOutbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromptVersion" ADD CONSTRAINT "PromptVersion_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StatusHistory" ADD CONSTRAINT "StatusHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "UsageLedger" ADD CONSTRAINT "UsageLedger_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationAccount" ADD CONSTRAINT "IntegrationAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadSource" ADD CONSTRAINT "LeadSource_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Organisation" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyLeadSource" ADD CONSTRAINT "CompanyLeadSource_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompanyLeadSource" ADD CONSTRAINT "CompanyLeadSource_leadSourceId_fkey" FOREIGN KEY ("leadSourceId") REFERENCES "LeadSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "User_email_key" ON "User" ("email");
CREATE UNIQUE INDEX "Organisation_slug_key" ON "Organisation" ("slug");
CREATE INDEX "OrganisationMembership_userId_idx" ON "OrganisationMembership" ("userId");
CREATE UNIQUE INDEX "OrganisationMembership_organisationId_userId_key" ON "OrganisationMembership" ("organisationId", "userId");
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession" ("tokenHash");
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession" ("userId", "expiresAt");
CREATE UNIQUE INDEX "DriverProfile_tenantId_key" ON "DriverProfile" ("tenantId");
CREATE INDEX "OnboardingResponse_tenantId_createdAt_idx" ON "OnboardingResponse" ("tenantId", "createdAt");
CREATE UNIQUE INDEX "OutreachPolicy_tenantId_key" ON "OutreachPolicy" ("tenantId");
CREATE INDEX "TargetMarket_tenantId_active_idx" ON "TargetMarket" ("tenantId", "active");
CREATE UNIQUE INDEX "TargetMarket_tenantId_country_region_type_key" ON "TargetMarket" ("tenantId", "country", "region", "type");
CREATE UNIQUE INDEX "DiscoveryPreference_tenantId_key" ON "DiscoveryPreference" ("tenantId");
CREATE INDEX "DiscoveryBrief_tenantId_active_idx" ON "DiscoveryBrief" ("tenantId", "active");
CREATE INDEX "DiscoveryBrief_tenantId_lastRunStatus_idx" ON "DiscoveryBrief" ("tenantId", "lastRunStatus");
CREATE INDEX "Company_tenantId_researchStatus_priority_idx" ON "Company" ("tenantId", "researchStatus", "priority");
CREATE INDEX "Company_tenantId_contactDiscoveryStatus_idx" ON "Company" ("tenantId", "contactDiscoveryStatus");
CREATE UNIQUE INDEX "Company_tenantId_companyKey_key" ON "Company" ("tenantId", "companyKey");
CREATE UNIQUE INDEX "CompanyScore_companyId_key" ON "CompanyScore" ("companyId");
CREATE INDEX "CompanyScore_commercialScore_idx" ON "CompanyScore" ("commercialScore");
CREATE INDEX "Contact_tenantId_echoStatus_status_idx" ON "Contact" ("tenantId", "echoStatus", "status");
CREATE INDEX "Contact_tenantId_contactPriority_idx" ON "Contact" ("tenantId", "contactPriority");
CREATE UNIQUE INDEX "Contact_tenantId_contactKey_key" ON "Contact" ("tenantId", "contactKey");
CREATE INDEX "EvidenceSource_tenantId_url_idx" ON "EvidenceSource" ("tenantId", "url");
CREATE UNIQUE INDEX "OutreachRecord_currentVersionId_key" ON "OutreachRecord" ("currentVersionId");
CREATE INDEX "OutreachRecord_tenantId_approvalStatus_linkedinStatus_idx" ON "OutreachRecord" ("tenantId", "approvalStatus", "linkedinStatus");
CREATE INDEX "OutreachRecord_tenantId_emailStatus_idx" ON "OutreachRecord" ("tenantId", "emailStatus");
CREATE UNIQUE INDEX "OutreachRecord_tenantId_outreachKey_key" ON "OutreachRecord" ("tenantId", "outreachKey");
CREATE UNIQUE INDEX "OutreachVersion_outreachRecordId_versionNumber_key" ON "OutreachVersion" ("outreachRecordId", "versionNumber");
CREATE INDEX "ApprovalEvent_outreachRecordId_createdAt_idx" ON "ApprovalEvent" ("outreachRecordId", "createdAt");
CREATE INDEX "ChannelAction_tenantId_channel_status_dueAt_idx" ON "ChannelAction" ("tenantId", "channel", "status", "dueAt");
CREATE UNIQUE INDEX "ChannelAction_tenantId_idempotencyKey_key" ON "ChannelAction" ("tenantId", "idempotencyKey");
CREATE INDEX "EmailMessage_tenantId_providerThreadId_idx" ON "EmailMessage" ("tenantId", "providerThreadId");
CREATE UNIQUE INDEX "EmailMessage_tenantId_providerMessageId_key" ON "EmailMessage" ("tenantId", "providerMessageId");
CREATE INDEX "SuppressionEntry_tenantId_email_idx" ON "SuppressionEntry" ("tenantId", "email");
CREATE INDEX "SuppressionEntry_tenantId_contactKey_idx" ON "SuppressionEntry" ("tenantId", "contactKey");
CREATE INDEX "Opportunity_tenantId_stage_idx" ON "Opportunity" ("tenantId", "stage");
CREATE INDEX "Interaction_tenantId_occurredAt_idx" ON "Interaction" ("tenantId", "occurredAt");
CREATE INDEX "Task_tenantId_status_dueAt_idx" ON "Task" ("tenantId", "status", "dueAt");
CREATE INDEX "Meeting_tenantId_startsAt_idx" ON "Meeting" ("tenantId", "startsAt");
CREATE UNIQUE INDEX "Proposal_currentVersionId_key" ON "Proposal" ("currentVersionId");
CREATE UNIQUE INDEX "ProposalVersion_proposalId_versionNumber_key" ON "ProposalVersion" ("proposalId", "versionNumber");
CREATE INDEX "AgentRun_tenantId_agentName_status_idx" ON "AgentRun" ("tenantId", "agentName", "status");
CREATE UNIQUE INDEX "AgentRun_tenantId_idempotencyKey_key" ON "AgentRun" ("tenantId", "idempotencyKey");
CREATE INDEX "AutomationJob_tenantId_status_scheduledFor_idx" ON "AutomationJob" ("tenantId", "status", "scheduledFor");
CREATE UNIQUE INDEX "AutomationJob_tenantId_idempotencyKey_key" ON "AutomationJob" ("tenantId", "idempotencyKey");
CREATE INDEX "JobOutbox_status_createdAt_idx" ON "JobOutbox" ("status", "createdAt");
CREATE UNIQUE INDEX "JobOutbox_tenantId_idempotencyKey_key" ON "JobOutbox" ("tenantId", "idempotencyKey");
CREATE INDEX "PromptVersion_tenantId_agentName_active_idx" ON "PromptVersion" ("tenantId", "agentName", "active");
CREATE UNIQUE INDEX "PromptVersion_tenantId_agentName_version_key" ON "PromptVersion" ("tenantId", "agentName", "version");
CREATE INDEX "StatusHistory_tenantId_entityType_entityId_createdAt_idx" ON "StatusHistory" ("tenantId", "entityType", "entityId", "createdAt");
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog" ("tenantId", "createdAt");
CREATE INDEX "AuditLog_tenantId_entityType_entityId_idx" ON "AuditLog" ("tenantId", "entityType", "entityId");
CREATE INDEX "UsageLedger_tenantId_occurredAt_idx" ON "UsageLedger" ("tenantId", "occurredAt");
CREATE UNIQUE INDEX "IntegrationAccount_tenantId_provider_key" ON "IntegrationAccount" ("tenantId", "provider");
CREATE UNIQUE INDEX "LeadSource_tenantId_name_key" ON "LeadSource" ("tenantId", "name");

-- Tenant isolation policies
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

