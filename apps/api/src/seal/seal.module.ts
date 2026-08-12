import { Module } from "@nestjs/common";
import { SealController } from "./seal.controller.js";
import { SealService } from "./seal.service.js";

@Module({ controllers: [SealController], providers: [SealService] })
export class SealModule {}
