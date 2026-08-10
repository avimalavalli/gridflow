import { Module } from "@nestjs/common";
import { ContextModule } from "../context/context.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { SealController } from "./seal.controller.js";
import { SealService } from "./seal.service.js";

@Module({
  imports: [DatabaseModule, ContextModule],
  controllers: [SealController],
  providers: [SealService],
  exports: [SealService],
})
export class SealModule {}
