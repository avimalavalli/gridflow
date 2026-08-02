import { Body, Controller, Delete, Get, Put, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { SaveGeminiCredentialDto } from "./ai-settings.dto.js";
import { AiSettingsService } from "./ai-settings.service.js";

@Controller("ai-settings")
export class AiSettingsController {
  constructor(private readonly settings: AiSettingsService, private readonly context: TenantContextService) {}

  @Get()
  async status(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return this.settings.status(identity.tenantId);
  }

  @Put("gemini")
  async save(@Req() request: Request, @Body() input: SaveGeminiCredentialDto) {
    const identity = await this.context.resolve(request);
    this.context.assertAdmin(identity);
    return this.settings.save(identity, input);
  }

  @Delete("gemini")
  async remove(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    this.context.assertAdmin(identity);
    return this.settings.remove(identity);
  }
}
