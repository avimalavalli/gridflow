import { IsUUID } from "class-validator";

export class StartPipelineDto {
  @IsUUID()
  discoveryBriefId!: string;
}
