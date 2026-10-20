import { Controller, Get } from "@nestjs/common";

@Controller("api")
export class HealthController {
  @Get("health")
  health(): { status: string } {
    return { status: "ok" };
  }
}
