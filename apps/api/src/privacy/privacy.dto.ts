import { IsEmail, IsIn, IsString, Length, MaxLength, MinLength } from "class-validator";

export const privacyRequestTypes = [
  "ACCESS", "CORRECTION", "DELETION", "RESTRICTION", "OBJECTION", "PORTABILITY", "COMPLAINT", "ACCOUNT_CLOSURE",
] as const;

export class CreatePrivacyRequestDto {
  @IsString()
  @Length(2, 120)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn(privacyRequestTypes)
  requestType!: typeof privacyRequestTypes[number];

  @IsString()
  @MinLength(10)
  @MaxLength(4000)
  details!: string;
}

export class RequestAccountClosureDto {
  @IsString()
  @IsIn(["CLOSE MY GRIDFLOW ACCOUNT"])
  confirmation!: "CLOSE MY GRIDFLOW ACCOUNT";

  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason!: string;
}

export class UpdatePrivacyRequestDto {
  @IsIn(["IDENTITY_CHECK", "IN_PROGRESS", "COMPLETED", "REJECTED"])
  status!: "IDENTITY_CHECK" | "IN_PROGRESS" | "COMPLETED" | "REJECTED";

  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  resolutionNotes!: string;
}
