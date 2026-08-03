import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { MarkForgeSentDto, QueueForgeDto, ReviseForgeDto, ReviewForgeDto } from "./forge.dto.js";
import { ForgeService } from "./forge.service.js";

@Controller("forge")
export class ForgeController {
  constructor(
    private readonly forge: ForgeService,
    private readonly context: TenantContextService,
  ) {}

  @Get()
  async overview(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return this.forge.overview(identity.tenantId);
  }

  @Get(":proposalId")
  async detail(@Req() request: Request, @Param("proposalId") proposalId: string) {
    const identity = await this.context.resolve(request);
    return this.forge.detail(identity.tenantId, proposalId);
  }

  @Post()
  async queue(@Req() request: Request, @Body() input: QueueForgeDto) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.forge.queue(identity.tenantId, identity.userId, input);
  }

  @Post(":proposalId/review")
  async review(@Req() request: Request, @Param("proposalId") proposalId: string, @Body() input: ReviewForgeDto) {
    const identity = await this.context.resolve(request);
    this.context.assertRole(identity, ["OWNER", "ADMIN", "REVIEWER"], "Only reviewers can approve Forge proposals.");
    return this.forge.review(identity.tenantId, identity.userId, proposalId, input);
  }

  @Post(":proposalId/revise")
  async revise(@Req() request: Request, @Param("proposalId") proposalId: string, @Body() input: ReviseForgeDto) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.forge.revise(identity.tenantId, identity.userId, proposalId, input.instructions);
  }

  @Post(":proposalId/retry")
  async retry(@Req() request: Request, @Param("proposalId") proposalId: string) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.forge.retry(identity.tenantId, identity.userId, proposalId);
  }

  @Post(":proposalId/mark-sent")
  async markSent(@Req() request: Request, @Param("proposalId") proposalId: string, @Body() input: MarkForgeSentDto) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.forge.markSent(identity.tenantId, identity.userId, proposalId, input);
  }
}
