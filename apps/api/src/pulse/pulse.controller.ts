import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { PulseService } from "./pulse.service.js";

@Controller("pulse")
export class PulseController {
  constructor(private readonly pulse: PulseService, private readonly context: TenantContextService) {}

  @Get()
  async overview(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return this.pulse.overview(identity.tenantId);
  }
}
