import { Module } from "@nestjs/common";
import { ContextModule } from "../context/context.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { NovaController } from "./nova.controller.js";
import { NovaService } from "./nova.service.js";

@Module({
  imports: [DatabaseModule, ContextModule],
  controllers: [NovaController],
  providers: [NovaService],
})
export class NovaModule {}
