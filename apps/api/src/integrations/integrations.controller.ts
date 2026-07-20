import { Body, Controller, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { apiConfig } from "../config.js";
import { IntegrationsService } from "./integrations.service.js";

@Controller("integrations")
export class IntegrationsController {
  constructor(private readonly integrations: IntegrationsService, private readonly context: TenantContextService) {}

  @Get()
  async status(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return this.integrations.status(identity.tenantId);
  }

  @Get("gmail/connect")
  async connect(@Req() request: Request, @Query("returnTo") returnTo?: string) {
    const identity = await this.context.resolve(request);
    this.context.assertAdmin(identity);
    return this.integrations.connectUrl(identity, returnTo);
  }

  @Get("gmail/callback")
  async callback(@Query("code") code: string, @Query("state") state: string, @Query("error") error: string | undefined, @Res() response: Response) {
    if (error) return response.redirect(`${apiConfig.webOrigin}/settings?gmail=error&reason=${encodeURIComponent(error)}`);
    try {
      const returnTo = await this.integrations.completeGmailOAuth(code, state);
      return response.redirect(`${apiConfig.webOrigin}${returnTo}${returnTo.includes("?") ? "&" : "?"}gmail=connected`);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Gmail connection failed.";
      return response.redirect(`${apiConfig.webOrigin}/settings?gmail=error&reason=${encodeURIComponent(message)}`);
    }
  }

  @Post("gmail/disconnect")
  async disconnect(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    this.context.assertAdmin(identity);
    return this.integrations.disconnect(identity);
  }

  @Post("gmail/sync")
  async sync(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.integrations.syncGmail(identity);
  }

  @Post("email/outreach/:id/action")
  async emailAction(@Req() request: Request, @Param("id") id: string, @Body() body: { action?: "CREATE_DRAFT" | "SEND_NOW" | "QUEUE"; sequenceStep?: "INITIAL" | "FOLLOW_UP_1" | "FOLLOW_UP_2"; dueAt?: string | null }) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.integrations.emailAction(identity, id, body);
  }

  @Post("email/outreach/:id/suppress")
  async suppress(@Req() request: Request, @Param("id") id: string, @Body() body: { reason?: "OPT_OUT" | "BOUNCED" | "INVALID_ADDRESS" | "USER_SUPPRESSED" | "LEGAL_RESTRICTION" | "ACTIVE_CONVERSATION"; notes?: string | null }) {
    const identity = await this.context.resolve(request);
    this.context.assertOperator(identity);
    return this.integrations.suppress(identity, id, body);
  }
}
