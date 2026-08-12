import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { CommerceController } from "./commerce.controller.js";
import { CommerceService } from "./commerce.service.js";

@Module({ imports: [DatabaseModule], controllers: [CommerceController], providers: [CommerceService], exports: [CommerceService] })
export class CommerceModule {}
