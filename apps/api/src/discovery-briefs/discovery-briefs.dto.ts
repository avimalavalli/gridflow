import { IsBoolean } from "class-validator";

export class SetDiscoveryBriefActiveDto {
  @IsBoolean()
  active!: boolean;
}
