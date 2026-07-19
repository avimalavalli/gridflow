import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { SetMigrationDecisionDto } from "./migration.dto.js";
import { MigrationService } from "./migration.service.js";

@Controller("migration")
export class MigrationController {
  constructor(
    private readonly migration: MigrationService,
    private readonly context: TenantContextService,
  ) {}

  @Get("airtable/audit")
  async audit(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return this.migration.airtableAudit(identity.tenantId);
  }

  @Post("airtable/decision")
  async decision(@Req() request: Request, @Body() body: SetMigrationDecisionDto) {
    const identity = await this.context.resolve(request);
    this.context.assertAdmin(identity);
    return this.migration.setDecision(identity.tenantId, identity.userId, body.legacyId, body.decision, body.notes);
  }

  @Post("airtable/approve-safe")
  async approveSafe(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    this.context.assertAdmin(identity);
    return this.migration.approveSafe(identity.tenantId, identity.userId);
  }

  @Get("airtable/import-preview")
  async preview(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return this.migration.preview(identity.tenantId);
  }

  @Post("airtable/import")
  async execute(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    this.context.assertAdmin(identity);
    return this.migration.execute(identity.tenantId, identity.userId);
  }

  @Get("airtable/runs")
  async runs(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return this.migration.runs(identity.tenantId);
  }
}
