import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { OpportunitiesService, type CreateOpportunityInput, type UpdateOpportunityInput } from "./opportunities.service.js";
@Controller("opportunities")
export class OpportunitiesController {
  constructor(private readonly service: OpportunitiesService, private readonly context: TenantContextService) {}
  @Get() async list(@Req() request: Request){ const i=await this.context.resolve(request); return { opportunities: await this.service.list(i.tenantId) }; }
  @Get(":id") async detail(@Req() request: Request,@Param("id") id:string){ const i=await this.context.resolve(request); return this.service.detail(i.tenantId,id); }
  @Post() async create(@Req() request: Request,@Body() body:CreateOpportunityInput){ const i=await this.context.resolve(request); this.context.assertOperator(i); return this.service.create(i.tenantId,i.userId,body); }
  @Patch(":id") async update(@Req() request: Request,@Param("id") id:string,@Body() body:UpdateOpportunityInput){ const i=await this.context.resolve(request); this.context.assertOperator(i); return this.service.update(i.tenantId,i.userId,id,body); }
}
