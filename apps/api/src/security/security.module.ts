import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DatabaseModule } from "../database/database.module.js";
import { SecurityRateLimitGuard } from "./security-rate-limit.guard.js";
import { SecurityRateLimitService } from "./security-rate-limit.service.js";

@Module({
  imports: [DatabaseModule],
  providers: [
    SecurityRateLimitService,
    { provide: APP_GUARD, useClass: SecurityRateLimitGuard },
  ],
  exports: [SecurityRateLimitService],
})
export class SecurityModule {}
