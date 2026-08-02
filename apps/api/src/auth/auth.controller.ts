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
  DisableMfaDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  SwitchOrganisationDto,
  VerifyMfaLoginDto,
  VerifyMfaSetupDto,
} from "./auth.dto.js";
import { AuthService } from "./auth.service.js";
import { apiConfig } from "../config.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly context: TenantContextService,
  ) {}

  @Get("registration")
  registration() {
    return { signupMode: apiConfig.signupMode };
  }

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


  @HttpCode(202)
  @Post("forgot-password")
  forgotPassword(@Body() input: ForgotPasswordDto, @Req() request: Request) {
    return this.auth.forgotPassword(input, request);
  }

  @HttpCode(200)
  @Post("reset-password")
  resetPassword(@Body() input: ResetPasswordDto, @Req() request: Request) {
    return this.auth.resetPassword(input, request);
  }

  @HttpCode(200)
  @Post("mfa/verify-login")
  verifyMfaLogin(
    @Body() input: VerifyMfaLoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.verifyMfaLogin(input, request, response);
  }

  @Post("mfa/setup")
  async setupMfa(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    return this.auth.setupMfa(identity);
  }

  @Post("mfa/enable")
  async enableMfa(@Req() request: Request, @Body() input: VerifyMfaSetupDto) {
    const identity = await this.context.resolve(request);
    return this.auth.enableMfa(identity, input);
  }

  @Post("mfa/recovery-codes")
  async regenerateRecoveryCodes(@Req() request: Request, @Body() input: VerifyMfaSetupDto) {
    const identity = await this.context.resolve(request);
    return this.auth.regenerateRecoveryCodes(identity, input);
  }

  @Post("mfa/disable")
  async disableMfa(@Req() request: Request, @Body() input: DisableMfaDto) {
    const identity = await this.context.resolve(request);
    return this.auth.disableMfa(identity, input);
  }

  @Get("me")
  async me(@Req() request: Request) {
    const identity = await this.context.resolveAnyAccess(request);
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
