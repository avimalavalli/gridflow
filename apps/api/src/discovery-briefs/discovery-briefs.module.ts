import { Module } from "@nestjs/common";
import { DiscoveryBriefsController } from "./discovery-briefs.controller.js";
import { DiscoveryBriefsService } from "./discovery-briefs.service.js";

@Module({ controllers: [DiscoveryBriefsController], providers: [DiscoveryBriefsService] })
export class DiscoveryBriefsModule {}
