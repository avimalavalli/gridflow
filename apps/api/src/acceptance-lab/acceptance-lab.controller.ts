import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import {
  CreateAcceptanceFindingDto,
  CreateAcceptanceJourneyDto,
  FreezeAcceptanceCycleDto,
  UpdateAcceptanceFindingDto,
  UpdateAcceptanceStepDto,
} from "./acceptance-lab.dto.js";
import { AcceptanceLabService } from "./acceptance-lab.service.js";

@Controller("platform/acceptance")
export class AcceptanceLabController {
  constructor(private readonly lab: AcceptanceLabService, private readonly context: TenantContextService) {}

  private async admin(request: Request) {
    const identity = await this.context.resolveAnyAccess(request);
    this.context.assertPlatformAdmin(identity);
    return identity;
  }

  @Get()
  async overview(@Req() request: Request) {
    await this.admin(request);
    return this.lab.overview();
  }

  @Post("journeys")
  async createJourney(@Req() request: Request, @Body() input: CreateAcceptanceJourneyDto) {
    return this.lab.createJourney(await this.admin(request), input, request);
  }

  @Post("steps/:id")
  async updateStep(@Req() request: Request, @Param("id") id: string, @Body() input: UpdateAcceptanceStepDto) {
    return this.lab.updateStep(await this.admin(request), id, input, request);
  }

  @Post("findings")
  async createFinding(@Req() request: Request, @Body() input: CreateAcceptanceFindingDto) {
    return this.lab.createFinding(await this.admin(request), input, request);
  }

  @Post("findings/:id")
  async updateFinding(@Req() request: Request, @Param("id") id: string, @Body() input: UpdateAcceptanceFindingDto) {
    return this.lab.updateFinding(await this.admin(request), id, input, request);
  }

  @Post("freeze")
  async freeze(@Req() request: Request, @Body() input: FreezeAcceptanceCycleDto) {
    return this.lab.freeze(await this.admin(request), input, request);
  }
}
