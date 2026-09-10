import { Controller, Get } from "@nestjs/common";
import type { HealthCheckResponse } from "@ewm/shared-types";

@Controller("health")
export class HealthController {
  @Get()
  check(): HealthCheckResponse {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      service: "api",
    };
  }
}
