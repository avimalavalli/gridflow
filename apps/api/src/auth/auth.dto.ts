import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from "class-validator";

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @IsString()
  @Length(2, 100)
  name!: string;

  @IsString()
  @Length(2, 120)
  organisationName!: string;

  @IsOptional()
  @IsIn(["DRIVER", "TEAM", "AGENCY", "COMMERCIAL_ORGANISATION"])
  organisationType?: "DRIVER" | "TEAM" | "AGENCY" | "COMMERCIAL_ORGANISATION";

  @IsOptional()
  @IsString()
  @MaxLength(200)
  betaCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  activationToken?: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;
}

export class AcceptInvitationDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsString()
  @Length(2, 100)
  name!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class SwitchOrganisationDto {
  @IsString()
  @MinLength(1)
  organisationId!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  token!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}

export class VerifyMfaLoginDto {
  @IsString()
  @MinLength(20)
  challengeToken!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code!: string;
}

export class VerifyMfaSetupDto {
  @IsString()
  @MinLength(6)
  @MaxLength(12)
  code!: string;
}

export class DisableMfaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(32)
  code!: string;
}
