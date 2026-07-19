import { Injectable } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

export interface ContactListItem extends Record<string, unknown> {
  id: string;
  contactName: string;
  jobTitle: string;
  companyName: string;
  companyId: string;
  email: string | null;
  linkedinProfileUrl: string | null;
  department: string;
  contactPriority: string;
  preferredChannel: string;
  echoStatus: string;
  companyPriority: string | null;
  confidence: number | null;
}

@Injectable()
export class ContactsService {
  constructor(private readonly database: DatabaseService) {}
  async list(tenantId: string): Promise<ContactListItem[]> {
    return this.database.tenantTransaction(tenantId, async (tx) => {
      const result = await tx.query<ContactListItem>(
        `SELECT c."id",c."contactName",c."jobTitle",c."companyId",co."companyName",c."email",c."linkedinProfileUrl",
                c."department"::text AS "department",c."contactPriority"::text AS "contactPriority",
                c."preferredChannel"::text AS "preferredChannel",c."echoStatus"::text AS "echoStatus",
                co."priority"::text AS "companyPriority",c."confidence"
         FROM "Contact" c JOIN "Company" co ON co."id"=c."companyId"
         WHERE c."tenantId"=$1::uuid ORDER BY co."priority" NULLS LAST,c."contactPriority",c."contactName"`, [tenantId],
      );
      return result.rows;
    });
  }
}
