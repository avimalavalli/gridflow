import { Module } from "@nestjs/common";
import { ContextModule } from "../context/context.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { ForgeController } from "./forge.controller.js";
import { ForgeService } from "./forge.service.js";

@Module({
  imports: [DatabaseModule, ContextModule],
  controllers: [ForgeController],
  providers: [ForgeService],
})
export class ForgeModule {}
