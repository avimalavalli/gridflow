import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

export enum AgentNameDto {
  ATLAS = "ATLAS",
  SAGE = "SAGE",
  RELAY = "RELAY",
  ECHO = "ECHO",
}

export class EnqueueAgentRunDto {
  @IsEnum(AgentNameDto)
  agentName!: AgentNameDto;

  @IsOptional()
  @IsUUID()
  discoveryBriefId?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  contactId?: string;

  @IsOptional()
  @IsBoolean()
  forceRegenerate?: boolean;
}

export class ReviewAgentRunDto {
  @IsString()
  @IsIn(["ACCEPTED", "NEEDS_TUNING", "REJECTED"])
  status!: "ACCEPTED" | "NEEDS_TUNING" | "REJECTED";

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class ResolveAgentRunDto {
  @IsString()
  @MinLength(12)
  @MaxLength(4000)
  resolutionNote!: string;
}
