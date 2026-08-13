import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { CreatePrivacyRequestDto, RequestAccountClosureDto, UpdatePrivacyRequestDto } from "./privacy.dto.js";
import { PrivacyService } from "./privacy.service.js";

@Controller("privacy")
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService, private readonly context: TenantContextService) {}

  @Post("requests")
  create(@Body() input: CreatePrivacyRequestDto, @Req() request: Request) {
    return this.privacy.createPublic(input, request);
  }

  @Get("me")
  async overview(@Req() request: Request) {
    return this.privacy.overview(await this.context.resolveAnyAccess(request));
  }

  @Get("export")
  async export(@Req() request: Request) {
    return this.privacy.export(await this.context.resolve(request));
  }

  @Post("account-closure")
  async closure(@Body() input: RequestAccountClosureDto, @Req() request: Request) {
    return this.privacy.requestClosure(await this.context.resolveAnyAccess(request), input, request);
  }

  @Get("platform/requests")
  async platformRequests(@Req() request: Request) {
    const identity = await this.context.resolveAnyAccess(request);
    this.context.assertPlatformAdmin(identity);
    return this.privacy.platformRequests();
  }

  @Post("platform/requests/:id")
  async update(@Param("id") id: string, @Body() input: UpdatePrivacyRequestDto, @Req() request: Request) {
    const identity = await this.context.resolveAnyAccess(request);
    this.context.assertPlatformAdmin(identity);
    return this.privacy.updatePlatformRequest(id, input);
  }
}
