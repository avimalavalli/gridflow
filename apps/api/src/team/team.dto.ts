import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateInvitationDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsIn(["ADMIN", "COMMERCIAL_OPERATOR", "REVIEWER", "READ_ONLY"])
  role?: "ADMIN" | "COMMERCIAL_OPERATOR" | "REVIEWER" | "READ_ONLY";
}

export class RevokeInvitationDto {
  @IsString()
  @MaxLength(100)
  invitationId!: string;
}
