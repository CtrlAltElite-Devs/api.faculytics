import { Injectable, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import {
  HealthCheckResult,
  HealthCheckService,
  HealthIndicatorResult,
} from '@nestjs/terminus';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    private readonly health: HealthCheckService,
    private readonly em: EntityManager,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async GetServerHealth(): Promise<HealthCheckResult> {
    return this.health.check([
      () => this.checkDatabase(),
      () => this.checkRedis(),
    ]);
  }

  private async checkDatabase(): Promise<HealthIndicatorResult> {
    try {
      await this.em.getConnection().execute('SELECT 1');
      return { database: { status: 'up' } };
    } catch (error) {
      this.logger.error(
        `Database health check failed: ${(error as Error).message}`,
      );
      return {
        database: { status: 'down', message: (error as Error).message },
      };
    }
  }

  private async checkRedis(): Promise<HealthIndicatorResult> {
    try {
      // Use cache store to verify Redis connectivity
      const testKey = '__health_check__';
      await this.cache.set(testKey, 'ok', 5000);
      const value = await this.cache.get(testKey);
      if (value === 'ok') {
        return { redis: { status: 'up' } };
      }
      return { redis: { status: 'down', message: 'Redis read/write failed' } };
    } catch (error) {
      this.logger.error(
        `Redis health check failed: ${(error as Error).message}`,
      );
      return { redis: { status: 'down', message: (error as Error).message } };
    }
  }
}
