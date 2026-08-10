import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import {
  ConfirmSealPaymentDto,
  ConfirmSealSignedDto,
  ConfirmSealTermsDto,
  CreateSealContractDto,
  CreateSealMilestoneDto,
  MarkSealReadyToSignDto,
} from "./seal.dto.js";
import { SealService } from "./seal.service.js";

@Controller("seal")
export class SealController {
  constructor(
    private readonly seal: SealService,
    private readonly context: TenantContextService,
  ) {}

  @Get()
  async overview(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return this.seal.overview(identity.tenantId);
  }

  @Get(":contractId")
  async detail(@Req() request: Request, @Param("contractId") contractId: string) {
    const identity = await this.context.resolve(request);
    return this.seal.detail(identity.tenantId, contractId);
  }

  @Post()
  async create(@Req() request: Request, @Body() input: CreateSealContractDto) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.seal.create(identity.tenantId, identity.userId, input);
  }

  @Post(":contractId/confirm-terms")
  async confirmTerms(@Req() request: Request, @Param("contractId") contractId: string, @Body() input: ConfirmSealTermsDto) {
    const identity = await this.context.resolve(request);
    this.context.assertRole(identity, ["OWNER", "ADMIN", "REVIEWER"], "Only reviewers can confirm Seal contract terms.");
    return this.seal.confirmTerms(identity.tenantId, identity.userId, contractId, input.confirmTermsReviewed, input.notes);
  }

  @Post(":contractId/ready-to-sign")
  async readyToSign(@Req() request: Request, @Param("contractId") contractId: string, @Body() input: MarkSealReadyToSignDto) {
    const identity = await this.context.resolve(request);
    this.context.assertRole(identity, ["OWNER", "ADMIN"], "Only owners or admins can mark a Seal contract ready to sign.");
    return this.seal.markReadyToSign(identity.tenantId, identity.userId, contractId, input);
  }

  @Post(":contractId/confirm-signed")
  async confirmSigned(@Req() request: Request, @Param("contractId") contractId: string, @Body() input: ConfirmSealSignedDto) {
    const identity = await this.context.resolve(request);
    this.context.assertRole(identity, ["OWNER", "ADMIN"], "Only owners or admins can confirm a fully executed Seal contract.");
    return this.seal.confirmSigned(identity.tenantId, identity.userId, contractId, input);
  }

  @Post(":contractId/milestones")
  async createMilestone(@Req() request: Request, @Param("contractId") contractId: string, @Body() input: CreateSealMilestoneDto) {
    const identity = await this.context.resolve(request);
    this.context.assertRole(identity, ["OWNER", "ADMIN", "REVIEWER"], "Only reviewers can add Seal payment milestones.");
    return this.seal.createMilestone(identity.tenantId, identity.userId, contractId, input);
  }

  @Post("milestones/:milestoneId/confirm-payment")
  async confirmPayment(@Req() request: Request, @Param("milestoneId") milestoneId: string, @Body() input: ConfirmSealPaymentDto) {
    const identity = await this.context.resolve(request);
    this.context.assertRole(identity, ["OWNER", "ADMIN"], "Only owners or admins can record a received payment.");
    return this.seal.confirmPayment(identity.tenantId, identity.userId, milestoneId, input);
  }
}
