import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { CreateReleaseAcceptanceDto, UpdateAcceptanceCheckDto } from "./release-acceptance.dto.js";
import { ReleaseAcceptanceService } from "./release-acceptance.service.js";

@Controller("release-acceptance")
export class ReleaseAcceptanceController {
  constructor(
    private readonly releases: ReleaseAcceptanceService,
    private readonly context: TenantContextService,
  ) {}

  @Get("overview")
  async overview(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    this.context.assertAdmin(identity);
    return this.releases.overview(identity.tenantId);
  }

  @Post("checks/:id")
  async updateCheck(@Req() request: Request, @Param("id") id: string, @Body() body: UpdateAcceptanceCheckDto) {
    const identity = await this.context.resolve(request);
    this.context.assertAdmin(identity);
    return this.releases.updateCheck(identity.tenantId, identity.userId, id, body);
  }

  @Post("create")
  async create(@Req() request: Request, @Body() body: CreateReleaseAcceptanceDto) {
    const identity = await this.context.resolve(request);
    this.context.assertAdmin(identity);
    return this.releases.create(identity.tenantId, identity.userId, body);
  }

  @Post("approve")
  async approve(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    this.context.assertOwner(identity);
    return this.releases.approve(identity.tenantId, identity.userId);
  }

  @Post("release")
  async markReleased(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    this.context.assertOwner(identity);
    return this.releases.markReleased(identity.tenantId, identity.userId);
  }
}
