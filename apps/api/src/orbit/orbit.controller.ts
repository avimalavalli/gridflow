import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { QueueOrbitDebriefDto, RetryOrbitDto, ReviewOrbitDebriefDto, ReviewOrbitPrepDto } from "./orbit.dto.js";
import { OrbitService } from "./orbit.service.js";

@Controller("orbit")
export class OrbitController {
  constructor(
    private readonly orbit: OrbitService,
    private readonly context: TenantContextService,
  ) {}

  @Get()
  async overview(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return this.orbit.overview(identity.tenantId);
  }

  @Post(":meetingId/prepare")
  async prepare(@Req() request: Request, @Param("meetingId") meetingId: string) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.orbit.queuePreparation(identity.tenantId, identity.userId, meetingId);
  }

  @Post(":meetingId/review-prep")
  async reviewPrep(@Req() request: Request, @Param("meetingId") meetingId: string, @Body() input: ReviewOrbitPrepDto) {
    const identity = await this.context.resolve(request);
    this.context.assertRole(identity, ["OWNER", "ADMIN", "REVIEWER"], "Only reviewers can approve Orbit preparation.");
    return this.orbit.reviewPreparation(identity.tenantId, identity.userId, meetingId, input);
  }

  @Post(":meetingId/debrief")
  async debrief(@Req() request: Request, @Param("meetingId") meetingId: string, @Body() input: QueueOrbitDebriefDto) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.orbit.queueDebrief(identity.tenantId, identity.userId, meetingId, input);
  }

  @Post(":meetingId/review-debrief")
  async reviewDebrief(@Req() request: Request, @Param("meetingId") meetingId: string, @Body() input: ReviewOrbitDebriefDto) {
    const identity = await this.context.resolve(request);
    this.context.assertRole(identity, ["OWNER", "ADMIN", "REVIEWER"], "Only reviewers can approve Orbit debriefs.");
    return this.orbit.reviewDebrief(identity.tenantId, identity.userId, meetingId, input);
  }

  @Post(":meetingId/retry")
  async retry(@Req() request: Request, @Param("meetingId") meetingId: string, @Body() input: RetryOrbitDto) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.orbit.retry(identity.tenantId, identity.userId, meetingId, input.stage);
  }
}
