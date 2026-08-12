import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { AddResearchCreditsDto, CreateActivationGrantDto, OrganisationAccessDecisionDto, RenewUltraDto } from "./platform.dto.js";
import { PlatformService } from "./platform.service.js";
import { CommerceService } from "../commerce/commerce.service.js";
import { ConfirmManualPurchaseDto, ResolveCommercialPurchaseDto } from "../commerce/commerce.dto.js";

@Controller("platform")
export class PlatformController {
  constructor(private readonly platform: PlatformService, private readonly context: TenantContextService, private readonly commerce: CommerceService) {}

  private async admin(request: Request) {
    const identity = await this.context.resolveAnyAccess(request);
    this.context.assertPlatformAdmin(identity);
    return identity;
  }

  @Get()
  async overview(@Req() request: Request) {
    await this.admin(request);
    return { ...(await this.platform.overview()), commerce: this.commerce.catalogue() };
  }

  @Post("activation-grants")
  async createGrant(@Req() request: Request, @Body() input: CreateActivationGrantDto) {
    return this.platform.createGrant(await this.admin(request), input, request);
  }

  @Post("activation-grants/:id/revoke")
  async revokeGrant(@Req() request: Request, @Param("id") id: string) {
    return this.platform.revokeGrant(await this.admin(request), id, request);
  }

  @Post("purchases/manual-confirm")
  async confirmManualPurchase(@Req() request: Request, @Body() input: ConfirmManualPurchaseDto) {
    return this.commerce.confirmManualPurchase(await this.admin(request), input, request);
  }

  @Post("purchases/:id/resolve")
  async resolvePurchase(@Req() request: Request, @Param("id") id: string, @Body() input: ResolveCommercialPurchaseDto) {
    return this.commerce.resolvePurchase(await this.admin(request), id, input, request);
  }

  @Post("organisations/:id/access")
  async decide(@Req() request: Request, @Param("id") id: string, @Body() input: OrganisationAccessDecisionDto) {
    return this.platform.decide(await this.admin(request), id, input, request);
  }

  @Post("organisations/:id/research-credits")
  async addCredits(@Req() request: Request, @Param("id") id: string, @Body() input: AddResearchCreditsDto) {
    return this.platform.addCredits(await this.admin(request), id, input, request);
  }

  @Post("organisations/:id/renew-ultra")
  async renewUltra(@Req() request: Request, @Param("id") id: string, @Body() input: RenewUltraDto) {
    return this.platform.renewUltra(await this.admin(request), id, input, request);
  }
}
