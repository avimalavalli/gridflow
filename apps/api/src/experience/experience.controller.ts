import { Body, Controller, Get, Patch, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { UpdateExperienceDto } from "./experience.dto.js";
import { ExperienceService } from "./experience.service.js";

@Controller("experience")
export class ExperienceController {
  constructor(
    private readonly experience: ExperienceService,
    private readonly context: TenantContextService,
  ) {}

  @Get()
  async get(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return this.experience.get(identity);
  }

  @Patch()
  async update(@Req() request: Request, @Body() input: UpdateExperienceDto) {
    const identity = await this.context.resolve(request);
    return this.experience.update(identity, input);
  }
}
