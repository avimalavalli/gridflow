import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { ActivateContractDto, CreateContractDto, MarkContractSentDto, RecordPaymentDto, ReviewContractDto, TerminateContractDto, UpdateSignerStatusDto } from "./seal.dto.js";
import { SealService } from "./seal.service.js";

@Controller("seal")
export class SealController {
  constructor(private readonly seal: SealService, private readonly context: TenantContextService) {}

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
  async create(@Req() request: Request, @Body() input: CreateContractDto) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.seal.create(identity.tenantId, identity.userId, input);
  }

  @Post(":contractId/submit-review")
  async submitReview(@Req() request: Request, @Param("contractId") contractId: string) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.seal.submitReview(identity.tenantId, identity.userId, contractId);
  }

  @Post(":contractId/revise")
  async revise(@Req() request: Request, @Param("contractId") contractId: string, @Body() input: CreateContractDto) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.seal.revise(identity.tenantId, identity.userId, contractId, input);
  }

  @Post(":contractId/review")
  async review(@Req() request: Request, @Param("contractId") contractId: string, @Body() input: ReviewContractDto) {
    const identity = await this.context.resolve(request);
    this.context.assertAdmin(identity);
    return this.seal.review(identity.tenantId, identity.userId, contractId, input);
  }

  @Post(":contractId/mark-sent")
  async markSent(@Req() request: Request, @Param("contractId") contractId: string, @Body() input: MarkContractSentDto) {
    const identity = await this.context.resolve(request);
    this.context.assertAdmin(identity);
    return this.seal.markSent(identity.tenantId, identity.userId, contractId, input);
  }

  @Post(":contractId/signers/:signerId/status")
  async updateSigner(@Req() request: Request, @Param("contractId") contractId: string, @Param("signerId") signerId: string, @Body() input: UpdateSignerStatusDto) {
    const identity = await this.context.resolve(request);
    this.context.assertAdmin(identity);
    return this.seal.updateSigner(identity.tenantId, identity.userId, contractId, signerId, input);
  }

  @Post(":contractId/activate")
  async activate(@Req() request: Request, @Param("contractId") contractId: string, @Body() input: ActivateContractDto) {
    const identity = await this.context.resolve(request);
    this.context.assertAdmin(identity);
    return this.seal.activate(identity.tenantId, identity.userId, contractId, input);
  }

  @Post(":contractId/milestones/:milestoneId/record")
  async recordPayment(@Req() request: Request, @Param("contractId") contractId: string, @Param("milestoneId") milestoneId: string, @Body() input: RecordPaymentDto) {
    const identity = await this.context.resolve(request);
    this.context.assertAdmin(identity);
    return this.seal.recordPayment(identity.tenantId, identity.userId, contractId, milestoneId, input);
  }

  @Post(":contractId/terminate")
  async terminate(@Req() request: Request, @Param("contractId") contractId: string, @Body() input: TerminateContractDto) {
    const identity = await this.context.resolve(request);
    this.context.assertAdmin(identity);
    return this.seal.terminate(identity.tenantId, identity.userId, contractId, input);
  }
}
