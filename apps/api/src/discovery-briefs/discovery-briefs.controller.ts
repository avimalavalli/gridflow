import { Body, Controller, Get, Param, Patch, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { SetDiscoveryBriefActiveDto } from "./discovery-briefs.dto.js";
import { DiscoveryBriefsService } from "./discovery-briefs.service.js";

@Controller("discovery-briefs")
export class DiscoveryBriefsController {
  constructor(
    private readonly briefs: DiscoveryBriefsService,
    private readonly context: TenantContextService,
  ) {}

  @Get()
  async list(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return { discoveryBriefs: await this.briefs.list(identity.tenantId) };
  }

  @Patch(":id/active")
  async setActive(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() input: SetDiscoveryBriefActiveDto,
  ) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    await this.briefs.setActive(identity.tenantId, id, input.active);
    return { ok: true };
  }
}
