import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import {
  AcceptInvitationDto,
  LoginDto,
  RegisterDto,
  SwitchOrganisationDto,
} from "./auth.dto.js";
import { AuthService } from "./auth.service.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly context: TenantContextService,
  ) {}

  @Post("register")
  async register(
    @Body() input: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.register(input, request, response);
  }

  @HttpCode(200)
  @Post("login")
  async login(
    @Body() input: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.login(input, request, response);
  }

  @HttpCode(200)
  @Post("logout")
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.logout(request, response);
  }

  @Get("me")
  async me(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return this.auth.me(identity);
  }

  @Post("switch-organisation")
  async switchOrganisation(@Req() request: Request, @Body() input: SwitchOrganisationDto) {
    const identity = await this.context.resolve(request);
    return this.auth.switchOrganisation(identity, input);
  }

  @Get("invitation")
  invitation(@Query("token") token = "") {
    return this.auth.invitationInfo(token);
  }

  @Post("accept-invitation")
  async acceptInvitation(
    @Body() input: AcceptInvitationDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.acceptInvitation(input, request, response);
  }
}
