import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { OutreachService } from "./outreach.service.js";
@Controller("outreach")
export class OutreachController {
  constructor(private readonly outreach: OutreachService, private readonly context: TenantContextService) {}
  @Get()
  async list(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return { outreach: await this.outreach.list(identity.tenantId) };
  }
}
