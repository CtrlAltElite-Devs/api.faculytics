import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { HealthCheckResult } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  GetServerHealth(): Promise<HealthCheckResult> {
    return this.healthService.GetServerHealth();
  }
}
