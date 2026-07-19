import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { CompleteOnboardingDto } from "./onboarding.dto.js";
import { OnboardingService } from "./onboarding.service.js";

@Controller("onboarding")
export class OnboardingController {
  constructor(
    private readonly onboarding: OnboardingService,
    private readonly context: TenantContextService,
  ) {}

  @Get()
  async get(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return this.onboarding.get(identity);
  }

  @Post("complete")
  async complete(@Req() request: Request, @Body() input: CompleteOnboardingDto) {
    const identity = await this.context.resolve(request);
    this.context.assertAdmin(identity);
    return this.onboarding.complete(identity, input);
  }
}
