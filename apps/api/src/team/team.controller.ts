import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { CreateInvitationDto } from "./team.dto.js";
import { TeamService } from "./team.service.js";

@Controller("team")
export class TeamController {
  constructor(
    private readonly team: TeamService,
    private readonly context: TenantContextService,
  ) {}

  @Get()
  async overview(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return this.team.overview(identity);
  }

  @Post("invitations")
  async invite(@Req() request: Request, @Body() input: CreateInvitationDto) {
    const identity = await this.context.resolve(request);
    return this.team.createInvitation(identity, input);
  }

  @Post("invitations/:id/revoke")
  async revoke(@Req() request: Request, @Param("id") id: string) {
    const identity = await this.context.resolve(request);
    return this.team.revokeInvitation(identity, id);
  }
}
