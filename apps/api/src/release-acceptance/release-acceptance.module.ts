import { Module } from "@nestjs/common";
import { ContextModule } from "../context/context.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { ReleaseAcceptanceController } from "./release-acceptance.controller.js";
import { ReleaseAcceptanceService } from "./release-acceptance.service.js";

@Module({
  imports: [DatabaseModule, ContextModule],
  controllers: [ReleaseAcceptanceController],
  providers: [ReleaseAcceptanceService],
})
export class ReleaseAcceptanceModule {}
