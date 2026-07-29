import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { LinkedInActionDto, OutreachDecisionDto, UpdateOutreachVersionDto } from "./outreach.dto.js";
import { OutreachService } from "./outreach.service.js";

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
  async updateVersion(@Req() request: Request, @Param("id") id: string, @Body() body: UpdateOutreachVersionDto) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.outreach.updateVersion(identity.tenantId, identity.userId, id, body);
  }

  @Post(":id/decision")
  async decision(@Req() request: Request, @Param("id") id: string, @Body() body: OutreachDecisionDto) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.outreach.decision(identity.tenantId, identity.userId, id, body);
  }

  @Post(":id/linkedin-action")
  async linkedinAction(@Req() request: Request, @Param("id") id: string, @Body() body: LinkedInActionDto) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.outreach.linkedinAction(identity.tenantId, identity.userId, id, body);
  }
}
