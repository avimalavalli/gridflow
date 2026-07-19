import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { DashboardService } from "./dashboard.service.js";

@Controller("dashboard")
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly context: TenantContextService,
  ) {}

  @Get("summary")
  async summary(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return this.dashboard.summary(identity.tenantId);
  }
}
