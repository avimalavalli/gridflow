import { Injectable, NotFoundException } from "@nestjs/common";
import { GRIDFLOW_LEGAL } from "@gridflow/domain";
import { randomBytes } from "node:crypto";
import type { Request } from "express";
import { normaliseEmail } from "../auth/auth.crypto.js";
import type { RequestIdentity } from "../context/tenant-context.service.js";
import { DatabaseService } from "../database/database.service.js";
import type { CreatePrivacyRequestDto, RequestAccountClosureDto, UpdatePrivacyRequestDto } from "./privacy.dto.js";

interface LinkRow extends Record<string, unknown> { userId: string | null; organisationId: string | null; }

function privacyReference(): string {
  return `GF-PRIV-${new Date().getUTCFullYear()}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

@Injectable()
export class PrivacyService {
  constructor(private readonly database: DatabaseService) {}

  async createPublic(input: CreatePrivacyRequestDto, request: Request) {
    const email = normaliseEmail(input.email);
    const linked = await this.database.transaction((tx) => tx.query<LinkRow>(
      `SELECT u."id" AS "userId",m."organisationId"
       FROM "User" u LEFT JOIN "OrganisationMembership" m ON m."userId"=u."id"
       WHERE u."email"=$1 ORDER BY m."createdAt" LIMIT 1`,
      [email],
    ));
    return this.createRecord({
      requestType: input.requestType,
      requesterName: input.name.trim(),
      requesterEmail: email,
      details: input.details.trim(),
      userId: linked.rows[0]?.userId ?? null,
      organisationId: linked.rows[0]?.organisationId ?? null,
      request,
    });
  }

  async overview(identity: RequestIdentity) {
    const [acceptances, requests] = await Promise.all([
      this.database.transaction((tx) => tx.query(
        `SELECT "documentType"::text AS "documentType","documentVersion","acceptedAt","ageConfirmed","authorityConfirmed"
         FROM "LegalAcceptance" WHERE "userId"=$1::uuid ORDER BY "acceptedAt" DESC`,
        [identity.userId],
      )),
      this.database.transaction((tx) => tx.query(
        `SELECT "reference","requestType"::text AS "requestType","status"::text AS "status","acknowledgedAt","responseDueAt","completedAt","createdAt"
         FROM "PrivacyRequest" WHERE "userId"=$1::uuid OR "organisationId"=$2::uuid ORDER BY "createdAt" DESC LIMIT 50`,
        [identity.userId, identity.tenantId],
      )),
    ]);
    return {
      legal: GRIDFLOW_LEGAL,
      acceptances: acceptances.rows,
      requests: requests.rows,
      contact: GRIDFLOW_LEGAL.supportEmail,
    };
  }

  async export(identity: RequestIdentity) {
    const database = await this.database.tenantTransaction(identity.tenantId, async (tx) => {
      const tables = [
        ["profile", `SELECT * FROM "DriverProfile" WHERE "tenantId"=$1::uuid`],
        ["onboarding", `SELECT * FROM "OnboardingResponse" WHERE "tenantId"=$1::uuid ORDER BY "createdAt"`],
        ["companies", `SELECT * FROM "Company" WHERE "tenantId"=$1::uuid ORDER BY "createdAt"`],
        ["contacts", `SELECT * FROM "Contact" WHERE "tenantId"=$1::uuid ORDER BY "createdAt"`],
        ["outreach", `SELECT * FROM "OutreachRecord" WHERE "tenantId"=$1::uuid ORDER BY "createdAt"`],
        ["opportunities", `SELECT * FROM "Opportunity" WHERE "tenantId"=$1::uuid ORDER BY "createdAt"`],
        ["interactions", `SELECT * FROM "Interaction" WHERE "tenantId"=$1::uuid ORDER BY "createdAt"`],
        ["tasks", `SELECT * FROM "Task" WHERE "tenantId"=$1::uuid ORDER BY "createdAt"`],
        ["meetings", `SELECT * FROM "Meeting" WHERE "tenantId"=$1::uuid ORDER BY "createdAt"`],
        ["proposals", `SELECT * FROM "Proposal" WHERE "tenantId"=$1::uuid ORDER BY "createdAt"`],
        ["contracts", `SELECT * FROM "Contract" WHERE "tenantId"=$1::uuid ORDER BY "createdAt"`],
        ["deliveryProgrammes", `SELECT * FROM "DeliveryProgramme" WHERE "tenantId"=$1::uuid ORDER BY "createdAt"`],
        ["renewalCases", `SELECT * FROM "RenewalCase" WHERE "tenantId"=$1::uuid ORDER BY "createdAt"`],
      ] as const;
      const entries = await Promise.all(tables.map(async ([name, sql]) => [name, (await tx.query(sql, [identity.tenantId])).rows] as const));
      return Object.fromEntries(entries);
    });
    const account = await this.database.transaction(async (tx) => {
      const [user, organisation, memberships] = await Promise.all([
        tx.query(`SELECT "id","email","name","status"::text AS "status","emailVerifiedAt","lastLoginAt","createdAt","updatedAt" FROM "User" WHERE "id"=$1::uuid`, [identity.userId]),
        tx.query(`SELECT "id","name","slug","type"::text AS "type","accessStatus"::text AS "accessStatus","createdAt","updatedAt" FROM "Organisation" WHERE "id"=$1::uuid`, [identity.tenantId]),
        tx.query(`SELECT m."organisationId",o."name" AS "organisationName",m."role"::text AS "role",m."createdAt" FROM "OrganisationMembership" m JOIN "Organisation" o ON o."id"=m."organisationId" WHERE m."userId"=$1::uuid`, [identity.userId]),
      ]);
      return { user: user.rows[0] ?? null, organisation: organisation.rows[0] ?? null, memberships: memberships.rows };
    });
    return {
      exportFormat: "GridFlow portable JSON",
      generatedAt: new Date().toISOString(),
      scope: "Account and active organisation data. Password hashes, session/device tokens, recovery codes, OAuth tokens and API keys are deliberately excluded.",
      account,
      workspace: database,
    };
  }

  async requestClosure(identity: RequestIdentity, input: RequestAccountClosureDto, request: Request) {
    return this.createRecord({
      requestType: "ACCOUNT_CLOSURE",
      requesterName: identity.userName,
      requesterEmail: identity.userEmail,
      details: `Account closure requested. Reason: ${input.reason.trim()}`,
      userId: identity.userId,
      organisationId: identity.tenantId,
      request,
    });
  }

  async platformRequests() {
    return this.database.platformTransaction(async (tx) => (await tx.query(
      `SELECT "id","reference","requestType"::text AS "requestType","status"::text AS "status","requesterName","requesterEmail",
              "details","acknowledgedAt","responseDueAt","completedAt","resolutionNotes","createdAt","updatedAt"
       FROM "PrivacyRequest" ORDER BY CASE "status" WHEN 'RECEIVED' THEN 0 WHEN 'IDENTITY_CHECK' THEN 1 WHEN 'IN_PROGRESS' THEN 2 ELSE 3 END,"responseDueAt" LIMIT 250`,
    )).rows);
  }

  async updatePlatformRequest(id: string, input: UpdatePrivacyRequestDto) {
    const result = await this.database.platformTransaction((tx) => tx.query(
      `UPDATE "PrivacyRequest" SET "status"=$2::"PrivacyRequestStatus","resolutionNotes"=$3,
         "completedAt"=CASE WHEN $2 IN ('COMPLETED','REJECTED') THEN CURRENT_TIMESTAMP ELSE NULL END,"updatedAt"=CURRENT_TIMESTAMP
       WHERE "id"=$1::uuid RETURNING "id","reference","status"::text AS "status","completedAt"`,
      [id, input.status, input.resolutionNotes.trim()],
    ));
    if (!result.rows[0]) throw new NotFoundException("Privacy request not found.");
    return result.rows[0];
  }

  private async createRecord(input: {
    requestType: string;
    requesterName: string;
    requesterEmail: string;
    details: string;
    userId: string | null;
    organisationId: string | null;
    request: Request;
  }) {
    const reference = privacyReference();
    const acknowledgedAt = new Date();
    const responseDueAt = new Date(acknowledgedAt.getTime() + 30 * 86_400_000);
    const acknowledgementText = `GridFlow received ${reference}. We will verify and investigate it without undue delay. We aim to respond within one month; if the request is unusually complex, we will explain any lawful extension.`;
    await this.database.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO "PrivacyRequest" (
           "reference","requestType","status","requesterName","requesterEmail","userId","organisationId","details",
           "acknowledgementText","acknowledgedAt","responseDueAt","ipAddress","userAgent","updatedAt"
         ) VALUES ($1,$2::"PrivacyRequestType",'RECEIVED',$3,$4,$5::uuid,$6::uuid,$7,$8,$9::timestamptz,$10::timestamptz,$11,$12,CURRENT_TIMESTAMP)`,
        [reference, input.requestType, input.requesterName, input.requesterEmail, input.userId, input.organisationId, input.details, acknowledgementText, acknowledgedAt.toISOString(), responseDueAt.toISOString(), input.request.ip ?? null, input.request.header("user-agent") ?? null],
      );
      const payload = JSON.stringify({ reference, requestType: input.requestType, supportEmail: GRIDFLOW_LEGAL.supportEmail });
      await tx.query(
        `INSERT INTO "AuthEmailOutbox" ("userId","recipient","template","payload","updatedAt") VALUES
           ($1::uuid,$2,'PRIVACY_REQUEST_ACKNOWLEDGEMENT',$4::jsonb,CURRENT_TIMESTAMP),
           (NULL,$3,'PRIVACY_REQUEST_ALERT',$4::jsonb,CURRENT_TIMESTAMP)`,
        [input.userId, input.requesterEmail, GRIDFLOW_LEGAL.supportEmail, payload],
      );
    });
    return { reference, acknowledgedAt, responseDueAt, acknowledgement: acknowledgementText, contact: GRIDFLOW_LEGAL.supportEmail };
  }
}
