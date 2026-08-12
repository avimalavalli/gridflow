import { Body, Controller, Get, Param, Post, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { ApproveDeliveryReportDto, CompleteDeliveryProgrammeDto, ConfigureDeliveryProgrammeDto, CreateDeliveryObligationDto, GenerateDeliveryReportDto, RecordDeliveryEvidenceDto, ShareDeliveryReportDto, TransitionDeliveryObligationDto, UpdateDeliveryObligationDto, UpdateDeliveryRenewalDto, VerifyDeliveryEvidenceDto } from "./delivery.dto.js";
import { DeliveryService } from "./delivery.service.js";

@Controller("delivery")
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService, private readonly context: TenantContextService) {}

  @Get() async overview(@Req() request: Request) { const identity = await this.context.resolve(request); return this.delivery.overview(identity.tenantId); }
  @Get(":programmeId") async detail(@Req() request: Request, @Param("programmeId") programmeId: string) { const identity = await this.context.resolve(request); return this.delivery.detail(identity.tenantId, programmeId); }

  @Post("contracts/:contractId/start") async start(@Req() request: Request, @Param("contractId") contractId: string) {
    const identity = await this.context.resolve(request); this.context.assertOperator(identity);
    return this.delivery.start(identity.tenantId, identity.userId, contractId);
  }
  @Post(":programmeId/configure") async configure(@Req() request: Request, @Param("programmeId") programmeId: string, @Body() input: ConfigureDeliveryProgrammeDto) {
    const identity = await this.context.resolve(request); this.context.assertAdmin(identity);
    return this.delivery.configure(identity.tenantId, identity.userId, programmeId, input);
  }
  @Post(":programmeId/obligations") async createObligation(@Req() request: Request, @Param("programmeId") programmeId: string, @Body() input: CreateDeliveryObligationDto) {
    const identity = await this.context.resolve(request); this.context.assertOperator(identity);
    return this.delivery.createObligation(identity.tenantId, identity.userId, programmeId, input);
  }
  @Put(":programmeId/obligations/:obligationId") async updateObligation(@Req() request: Request, @Param("programmeId") programmeId: string, @Param("obligationId") obligationId: string, @Body() input: UpdateDeliveryObligationDto) {
    const identity = await this.context.resolve(request); this.context.assertOperator(identity);
    return this.delivery.updateObligation(identity.tenantId, identity.userId, programmeId, obligationId, input);
  }
  @Post(":programmeId/obligations/:obligationId/evidence") async evidence(@Req() request: Request, @Param("programmeId") programmeId: string, @Param("obligationId") obligationId: string, @Body() input: RecordDeliveryEvidenceDto) {
    const identity = await this.context.resolve(request); this.context.assertOperator(identity);
    return this.delivery.recordEvidence(identity.tenantId, identity.userId, programmeId, obligationId, input);
  }
  @Post(":programmeId/evidence/:evidenceId/verify") async verifyEvidence(@Req() request: Request, @Param("programmeId") programmeId: string, @Param("evidenceId") evidenceId: string, @Body() input: VerifyDeliveryEvidenceDto) {
    const identity = await this.context.resolve(request); this.context.assertRole(identity, ["OWNER","ADMIN","REVIEWER"], "Only reviewers can verify delivery evidence.");
    return this.delivery.verifyEvidence(identity.tenantId, identity.userId, programmeId, evidenceId, input);
  }
  @Post(":programmeId/obligations/:obligationId/transition") async transition(@Req() request: Request, @Param("programmeId") programmeId: string, @Param("obligationId") obligationId: string, @Body() input: TransitionDeliveryObligationDto) {
    const identity = await this.context.resolve(request);
    if (["VERIFIED","WAIVED"].includes(input.status)) this.context.assertAdmin(identity); else this.context.assertOperator(identity);
    return this.delivery.transition(identity.tenantId, identity.userId, programmeId, obligationId, input);
  }
  @Post(":programmeId/reports") async report(@Req() request: Request, @Param("programmeId") programmeId: string, @Body() input: GenerateDeliveryReportDto) {
    const identity = await this.context.resolve(request); this.context.assertOperator(identity);
    return this.delivery.generateReport(identity.tenantId, identity.userId, programmeId, input);
  }
  @Post(":programmeId/reports/:reportId/approve") async approveReport(@Req() request: Request, @Param("programmeId") programmeId: string, @Param("reportId") reportId: string, @Body() input: ApproveDeliveryReportDto) {
    const identity = await this.context.resolve(request); this.context.assertAdmin(identity);
    return this.delivery.approveReport(identity.tenantId, identity.userId, programmeId, reportId, input);
  }
  @Post(":programmeId/reports/:reportId/share") async shareReport(@Req() request: Request, @Param("programmeId") programmeId: string, @Param("reportId") reportId: string, @Body() input: ShareDeliveryReportDto) {
    const identity = await this.context.resolve(request); this.context.assertAdmin(identity);
    return this.delivery.shareReport(identity.tenantId, identity.userId, programmeId, reportId, input);
  }
  @Post(":programmeId/renewal") async renewal(@Req() request: Request, @Param("programmeId") programmeId: string, @Body() input: UpdateDeliveryRenewalDto) {
    const identity = await this.context.resolve(request); this.context.assertAdmin(identity);
    return this.delivery.updateRenewal(identity.tenantId, identity.userId, programmeId, input);
  }
  @Post(":programmeId/complete") async complete(@Req() request: Request, @Param("programmeId") programmeId: string, @Body() input: CompleteDeliveryProgrammeDto) {
    const identity = await this.context.resolve(request); this.context.assertAdmin(identity);
    return this.delivery.complete(identity.tenantId, identity.userId, programmeId, input);
  }
}
