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
