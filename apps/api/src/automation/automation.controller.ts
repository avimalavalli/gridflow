import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { AutomationService } from "./automation.service.js";
import { AutomationDecisionDto, BatchAutomationDecisionDto, UpdateAutomationPolicyDto } from "./automation.dto.js";

@Controller("automation")
export class AutomationController {
  constructor(private readonly automation: AutomationService, private readonly context: TenantContextService) {}

  @Get()
  async overview(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return this.automation.overview(identity);
  }

  @Patch("policy")
  async updatePolicy(@Req() request: Request, @Body() input: UpdateAutomationPolicyDto) {
    const identity = await this.context.resolve(request);
    this.context.assertAdmin(identity);
    return this.automation.updatePolicy(identity, input);
  }

  @Post("run-now")
  async runNow(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.automation.runNow(identity);
  }

  @Post("approvals/batch")
  async batch(@Req() request: Request, @Body() input: BatchAutomationDecisionDto) {
    const identity = await this.context.resolve(request);
    this.context.assertRole(identity, ["OWNER", "ADMIN", "REVIEWER"], "Only reviewers can approve automation decisions.");
    return this.automation.batchDecision(identity, input);
  }

  @Post("approvals/:id/decision")
  async decide(@Req() request: Request, @Param("id") id: string, @Body() input: AutomationDecisionDto) {
    const identity = await this.context.resolve(request);
    this.context.assertRole(identity, ["OWNER", "ADMIN", "REVIEWER"], "Only reviewers can approve automation decisions.");
    return this.automation.decision(identity, id, input);
  }
}
