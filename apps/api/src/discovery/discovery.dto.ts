import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import type { EmailAutomationMode, OutreachStrategy } from "@gridflow/domain";

const outreachStrategies: OutreachStrategy[] = [
  "LINKEDIN_FIRST",
  "EMAIL_FIRST",
  "PARALLEL",
  "MANUAL",
  "CUSTOM",
];
const emailModes: EmailAutomationMode[] = [
  "MANUAL",
  "DRAFT_ONLY",
  "APPROVED_AUTOMATIC",
  "FULL_AUTOMATION",
];

export class RecommendDiscoveryBriefsDto {
  @IsString()
  name!: string;

  @IsString()
  sport!: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsString()
  residenceCountry!: string;

  @IsArray()
  @IsString({ each: true })
  competitionCountries!: string[];

  @IsArray()
  @IsString({ each: true })
  targetCountries!: string[];

  @IsOptional()
  @IsString()
  targetSeries?: string;

  @IsOptional()
  @IsString()
  achievements?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sponsorshipTargetMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  sponsorshipTargetMax?: number;

  @IsArray()
  @IsString({ each: true })
  preferredIndustries!: string[];

  @IsArray()
  @IsString({ each: true })
  excludedIndustries!: string[];

  @IsIn(outreachStrategies)
  outreachStrategy!: OutreachStrategy;

  @IsIn(emailModes)
  emailAutomationMode!: EmailAutomationMode;
}
