import { Controller, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { TenantContextService } from "../context/tenant-context.service.js";
import { OperationsService } from "./operations.service.js";

@Controller("operations")
export class OperationsController {
  constructor(
    private readonly operations: OperationsService,
    private readonly context: TenantContextService,
  ) {}

  @Get("overview")
  async overview(@Req() request: Request) {
    const identity = await this.context.resolve(request);
    this.context.assertAdmin(identity);
    return this.operations.overview(identity.tenantId);
  }
}
