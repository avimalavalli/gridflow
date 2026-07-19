import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { AgentRunsService } from "./agent-runs.service.js";
import { EnqueueAgentRunDto } from "./agent-runs.dto.js";

@Controller("agent-runs")
export class AgentRunsController {
  constructor(
    private readonly runs: AgentRunsService,
    private readonly context: TenantContextService,
  ) {}

  @Get()
  async list(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return { agentRuns: await this.runs.list(identity.tenantId) };
  }

  @Post()
  async enqueue(@Req() request: Request, @Body() input: EnqueueAgentRunDto) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.runs.enqueue(identity.tenantId, identity.userId, input);
  }

  @Post(":id/retry")
  async retry(@Req() request: Request, @Param("id") id: string) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.runs.retry(identity.tenantId, identity.userId, id);
  }
}
