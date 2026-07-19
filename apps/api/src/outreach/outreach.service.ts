import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

export interface OutreachListItem extends Record<string, unknown> {
  id: string;
  outreachName: string;
  companyName: string;
  contactName: string;
  draftStatus: string;
  approvalStatus: string;
  linkedinStatus: string;
  emailStatus: string;
  versionNumber: number | null;
  linkedinConnectionNote: string | null;
  linkedinFollowUpMessage: string | null;
  emailSubject: string | null;
  emailBody: string | null;
  callOpener: string | null;
  partnershipPitch: string | null;
  generatedAt: Date | null;
}

@Injectable()
export class OutreachService {
  constructor(private readonly database: DatabaseService) {}
  async list(tenantId: string): Promise<OutreachListItem[]> {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<OutreachListItem>(
        `SELECT o."id",o."outreachName",co."companyName",c."contactName",
                o."draftStatus"::text AS "draftStatus",o."approvalStatus"::text AS "approvalStatus",
                o."linkedinStatus"::text AS "linkedinStatus",o."emailStatus"::text AS "emailStatus",
                v."versionNumber",v."linkedinConnectionNote",v."linkedinFollowUpMessage",v."emailSubject",v."emailBody",
                v."callOpener",v."partnershipPitch",o."generatedAt"
         FROM "OutreachRecord" o JOIN "Company" co ON co."id"=o."companyId" JOIN "Contact" c ON c."id"=o."contactId"
         LEFT JOIN "OutreachVersion" v ON v."id"=o."currentVersionId"
         WHERE o."tenantId"=$1::uuid ORDER BY o."generatedAt" DESC NULLS LAST,o."createdAt" DESC`, [tenantId],
      );
      return result.rows;
    });
  }
}
