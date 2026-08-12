import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, migrateDatabase, setTenantContext, type GridFlowDatabase, type SqlExecutor } from "@gridflow/database";
import { SearchService } from "../src/search/search.service.js";

class TestDatabaseService {
  constructor(private readonly database: GridFlowDatabase) {}
  tenantTransaction<T>(tenantId: string, callback: (tx: SqlExecutor) => Promise<T>) {
    return this.database.transaction(async (tx) => { await setTenantContext(tx, tenantId); return callback(tx); });
  }
}

let database: GridFlowDatabase | undefined;

beforeEach(async () => { database = await createDatabase("pglite://memory"); await migrateDatabase(database); });
afterEach(async () => { await database?.close(); database = undefined; });

describe("global commercial search", () => {
  it("finds lifecycle records with exact destinations and never crosses tenant boundaries", async () => {
    const tenant = await database!.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","updatedAt") VALUES ('Search Racing','search-racing',CURRENT_TIMESTAMP) RETURNING "id"`);
    const other = await database!.query<{ id: string }>(`INSERT INTO "Organisation" ("name","slug","updatedAt") VALUES ('Other Racing','other-racing',CURRENT_TIMESTAMP) RETURNING "id"`);
    const company = await database!.query<{ id: string }>(
      `INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","industries","updatedAt") VALUES ($1::uuid,'Apex Mobility','https://apex.test','apex.test','apex','Automotive',CURRENT_TIMESTAMP) RETURNING "id"`,
      [tenant.rows[0]!.id],
    );
    const contact = await database!.query<{ id: string }>(
      `INSERT INTO "Contact" ("tenantId","companyId","contactName","jobTitle","contactKey","updatedAt") VALUES ($1::uuid,$2::uuid,'Maya Singh','Partnerships Director','maya-singh',CURRENT_TIMESTAMP) RETURNING "id"`,
      [tenant.rows[0]!.id, company.rows[0]!.id],
    );
    const opportunity = await database!.query<{ id: string }>(
      `INSERT INTO "Opportunity" ("tenantId","companyId","opportunityName","stage","updatedAt") VALUES ($1::uuid,$2::uuid,'Apex title partnership','NEGOTIATION',CURRENT_TIMESTAMP) RETURNING "id"`,
      [tenant.rows[0]!.id, company.rows[0]!.id],
    );
    await database!.query(
      `INSERT INTO "Company" ("tenantId","companyName","website","companyDomain","companyKey","updatedAt") VALUES ($1::uuid,'Apex Private','https://private.test','private.test','private-apex',CURRENT_TIMESTAMP)`,
      [other.rows[0]!.id],
    );

    const service = new SearchService(new TestDatabaseService(database!) as never);
    const apex = await service.search(tenant.rows[0]!.id, "apex");
    expect(apex.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "COMPANY", title: "Apex Mobility", href: `/companies/${company.rows[0]!.id}` }),
      expect.objectContaining({ kind: "CONTACT", title: "Maya Singh", href: `/contacts/${contact.rows[0]!.id}` }),
      expect.objectContaining({ kind: "OPPORTUNITY", title: "Apex title partnership", href: `/opportunities/${opportunity.rows[0]!.id}` }),
    ]));
    expect(apex.results.some((item) => item.title === "Apex Private")).toBe(false);

    const person = await service.search(tenant.rows[0]!.id, "Maya");
    expect(person.results.map((item) => item.kind)).toEqual(["CONTACT"]);
    expect((await service.search(tenant.rows[0]!.id, "a")).results).toEqual([]);
    expect((await service.search(tenant.rows[0]!.id, "%_")).results).toEqual([]);
  });
});
