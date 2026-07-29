import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { StartPipelineDto } from "./pipelines.dto.js";
import { PipelinesService } from "./pipelines.service.js";

@Controller("pipelines")
export class PipelinesController {
  constructor(
    private readonly pipelines: PipelinesService,
    private readonly context: TenantContextService,
  ) {}

  @Get()
  async list(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return { pipelines: await this.pipelines.list(identity.tenantId) };
  }

  @Post()
  async start(@Req() request: Request, @Body() input: StartPipelineDto) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.pipelines.start(identity.tenantId, identity.userId, input.discoveryBriefId);
  }
}
