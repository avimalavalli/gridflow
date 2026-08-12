import { Body, Controller, Get, Param, Post, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { ApproveRenewalCaseDto, HandoffRenewalCaseDto, PrepareRenewalCaseDto, SubmitRenewalCaseDto, UpdateRenewalCaseDto } from "./renewals.dto.js";
import { RenewalsService } from "./renewals.service.js";

@Controller("renewals")
export class RenewalsController {
  constructor(private readonly renewals: RenewalsService, private readonly context: TenantContextService) {}

  @Get() async overview(@Req() request: Request) { const identity=await this.context.resolve(request); return this.renewals.overview(identity.tenantId); }
  @Get(":caseId") async detail(@Req() request: Request,@Param("caseId") caseId:string) { const identity=await this.context.resolve(request); return this.renewals.detail(identity.tenantId,caseId); }
  @Post("programmes/:programmeId/prepare") async prepare(@Req() request:Request,@Param("programmeId") programmeId:string,@Body() input:PrepareRenewalCaseDto) { const identity=await this.context.resolve(request);this.context.assertOperator(identity);return this.renewals.prepare(identity.tenantId,identity.userId,programmeId,input); }
  @Put(":caseId") async update(@Req() request:Request,@Param("caseId") caseId:string,@Body() input:UpdateRenewalCaseDto) { const identity=await this.context.resolve(request);this.context.assertOperator(identity);return this.renewals.update(identity.tenantId,identity.userId,caseId,input); }
  @Post(":caseId/submit") async submit(@Req() request:Request,@Param("caseId") caseId:string,@Body() input:SubmitRenewalCaseDto) { const identity=await this.context.resolve(request);this.context.assertOperator(identity);return this.renewals.submit(identity.tenantId,identity.userId,caseId,input); }
  @Post(":caseId/approve") async approve(@Req() request:Request,@Param("caseId") caseId:string,@Body() input:ApproveRenewalCaseDto) { const identity=await this.context.resolve(request);this.context.assertAdmin(identity);return this.renewals.approve(identity.tenantId,identity.userId,caseId,input); }
  @Post(":caseId/handoff") async handoff(@Req() request:Request,@Param("caseId") caseId:string,@Body() input:HandoffRenewalCaseDto) { const identity=await this.context.resolve(request);this.context.assertAdmin(identity);return this.renewals.handoff(identity.tenantId,identity.userId,caseId,input); }
}
