import { Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { SearchService } from "./search.service.js";

@Controller("search")
export class SearchController {
  constructor(private readonly searchService: SearchService, private readonly context: TenantContextService) {}

  @Get()
  async search(@Req() request: Request, @Query("q") query?: string) {
    const identity = await this.context.resolve(request);
    return this.searchService.search(identity.tenantId, query);
  }
}
