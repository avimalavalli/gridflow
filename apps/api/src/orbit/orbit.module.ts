import { Module } from "@nestjs/common";
import { ContextModule } from "../context/context.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { OrbitController } from "./orbit.controller.js";
import { OrbitService } from "./orbit.service.js";

@Module({
  imports: [DatabaseModule, ContextModule],
  controllers: [OrbitController],
  providers: [OrbitService],
})
export class OrbitModule {}
