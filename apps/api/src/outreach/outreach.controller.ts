import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { OutreachService, type OutreachDecisionInput, type UpdateOutreachVersionInput, type LinkedInActionInput } from "./outreach.service.js";

@Controller("outreach")
export class OutreachController {
  constructor(private readonly outreach: OutreachService, private readonly context: TenantContextService) {}

  @Get()
  async list(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return { outreach: await this.outreach.list(identity.tenantId) };
  }

  @Get("operations/summary")
  async operations(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return this.outreach.operations(identity.tenantId);
  }

  @Get(":id")
  async detail(@Req() request: Request, @Param("id") id: string) {
    const identity = await this.context.resolve(request);
    return this.outreach.detail(identity.tenantId, id);
  }

  @Patch(":id/version")
  async updateVersion(@Req() request: Request, @Param("id") id: string, @Body() body: UpdateOutreachVersionInput) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.outreach.updateVersion(identity.tenantId, id, body);
  }

  @Post(":id/decision")
  async decision(@Req() request: Request, @Param("id") id: string, @Body() body: OutreachDecisionInput) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.outreach.decision(identity.tenantId, identity.userId, id, body);
  }

  @Post(":id/linkedin-action")
  async linkedinAction(@Req() request: Request, @Param("id") id: string, @Body() body: LinkedInActionInput) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.outreach.linkedinAction(identity.tenantId, id, body);
  }
}
