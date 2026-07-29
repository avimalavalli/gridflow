import { Module } from "@nestjs/common";
import { ContextModule } from "../context/context.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { SentinelController } from "./sentinel.controller.js";
import { SentinelService } from "./sentinel.service.js";

@Module({
  imports: [DatabaseModule, ContextModule],
  controllers: [SentinelController],
  providers: [SentinelService],
})
export class SentinelModule {}
