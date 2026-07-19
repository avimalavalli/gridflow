import { Body, Controller, Post } from "@nestjs/common";
import { recommendDiscoveryBriefs, type DiscoveryBriefRecommendation } from "@gridflow/domain";
import { RecommendDiscoveryBriefsDto } from "./discovery.dto.js";

@Controller("discovery")
export class DiscoveryController {
  @Post("recommendations")
  recommend(@Body() input: RecommendDiscoveryBriefsDto): {
    recommendations: DiscoveryBriefRecommendation[];
  } {
    return { recommendations: recommendDiscoveryBriefs(input) };
  }
}
