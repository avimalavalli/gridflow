import { Controller, Get } from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get()
  async check(): Promise<Record<string, unknown>> {
    const database = await this.database.ping();
    return {
      status: "ok",
      service: "gridflow-api",
      timestamp: new Date().toISOString(),
      ...database,
    };
  }
}
