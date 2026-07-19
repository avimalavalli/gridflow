import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { CompaniesService } from "./companies.service.js";

@Controller("companies")
export class CompaniesController {
  constructor(
    private readonly companies: CompaniesService,
    private readonly context: TenantContextService,
  ) {}

  @Get()
  async list(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return { companies: await this.companies.list(identity.tenantId) };
  }
}
