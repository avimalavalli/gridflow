import { Module } from "@nestjs/common";
import { ContextModule } from "../context/context.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PlatformController } from "./platform.controller.js";
import { PlatformService } from "./platform.service.js";

@Module({ imports: [DatabaseModule, ContextModule], controllers: [PlatformController], providers: [PlatformService] })
export class PlatformModule {}
