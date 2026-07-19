import { IsBoolean, IsEnum, IsOptional, IsUUID } from "class-validator";

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
