import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from 'src/security/decorators';
import { HealthService } from './health.service';
import { HealthCheckResult } from '@nestjs/terminus';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  GetServerHealth(): Promise<HealthCheckResult> {
    return this.healthService.GetServerHealth();
  }
}
