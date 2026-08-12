import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsObject, IsOptional, Max, Min } from "class-validator";

export class UpdateExperienceDto {
  @IsOptional()
  @IsBoolean()
  welcomeCompleted?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(7)
  tutorialStep?: number;

  @IsOptional()
  @IsBoolean()
  tutorialCompleted?: boolean;

  @IsOptional()
  @IsBoolean()
  manualOpened?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(4)
  onboardingStep?: number;

  @IsOptional()
  @IsObject()
  onboardingDraft?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  clearOnboardingDraft?: boolean;
}
