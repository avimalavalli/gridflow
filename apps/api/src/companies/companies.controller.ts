import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { CompaniesService, type CreateCompanyInput, type UpdateCompanyInput } from "./companies.service.js";

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


  @Post()
  async create(@Req() request: Request, @Body() input: CreateCompanyInput) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.companies.create(identity.tenantId, identity.userId, input);
  }

  @Get(":id")
  async detail(@Req() request: Request, @Param("id") id: string) {
    const identity = await this.context.resolve(request);
    return this.companies.detail(identity.tenantId, id);
  }

  @Patch(":id")
  async update(@Req() request: Request, @Param("id") id: string, @Body() input: UpdateCompanyInput) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.companies.update(identity.tenantId, id, input);
  }
}
