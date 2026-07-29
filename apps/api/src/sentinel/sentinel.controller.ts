import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { ReviewSentinelReplyDto } from "./sentinel.dto.js";
import { SentinelService } from "./sentinel.service.js";

@Controller("sentinel")
export class SentinelController {
  constructor(
    private readonly sentinel: SentinelService,
    private readonly context: TenantContextService,
  ) {}

  @Get()
  async overview(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return this.sentinel.overview(identity.tenantId);
  }

  @Post(":id/review")
  async review(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() input: ReviewSentinelReplyDto,
  ) {
    const identity = await this.context.resolve(request);
    this.context.assertRole(
      identity,
      ["OWNER", "ADMIN", "REVIEWER"],
      "Only owners, administrators and reviewers can review Sentinel replies.",
    );
    return this.sentinel.review(identity.tenantId, identity.userId, id, input);
  }

  @Post(":id/retry")
  async retry(@Req() request: Request, @Param("id") id: string) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.sentinel.retry(identity.tenantId, identity.userId, id);
  }
}
