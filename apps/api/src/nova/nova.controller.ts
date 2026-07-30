import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { ReviewNovaDto } from "./nova.dto.js";
import { NovaService } from "./nova.service.js";

@Controller("nova")
export class NovaController {
  constructor(
    private readonly nova: NovaService,
    private readonly context: TenantContextService,
  ) {}

  @Get()
  async overview(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return this.nova.overview(identity.tenantId);
  }

  @Post(":id/review")
  async review(@Req() request: Request, @Param("id") id: string, @Body() input: ReviewNovaDto) {
    const identity = await this.context.resolve(request);
    this.context.assertRole(
      identity,
      ["OWNER", "ADMIN", "REVIEWER"],
      "Only owners, administrators and reviewers can approve Nova recommendations.",
    );
    return this.nova.review(identity.tenantId, identity.userId, id, input);
  }

  @Post(":id/retry")
  async retry(@Req() request: Request, @Param("id") id: string) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.nova.retry(identity.tenantId, identity.userId, id);
  }
}
