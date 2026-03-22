import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { EntityManager } from '@mikro-orm/postgresql';
import { QueueName } from 'src/configurations/common/queue-names';
import { SystemConfig } from 'src/entities/system-config.entity';

interface AnalyticsRefreshJobData {
  pipelineId: string;
}

@Processor(QueueName.ANALYTICS_REFRESH, { concurrency: 1 })
export class AnalyticsRefreshProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsRefreshProcessor.name);

  constructor(private readonly em: EntityManager) {
    super();
  }

  async process(job: Job<AnalyticsRefreshJobData>): Promise<void> {
    const start = Date.now();
    this.logger.log(
      `Refreshing analytics materialized views (pipeline: ${job.data.pipelineId})`,
    );

    const fork = this.em.fork();
    const conn = fork.getConnection();

    // Refresh stats first — trends depends on it
    await conn.execute(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_faculty_semester_stats',
    );
    this.logger.log('Refreshed mv_faculty_semester_stats');

    // Refresh trends after stats
    await conn.execute(
      'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_faculty_trends',
    );
    this.logger.log('Refreshed mv_faculty_trends');

    // Track refresh timestamp — create() triggers UUID/timestamp initializers before upsert
    const config = fork.create(
      SystemConfig,
      {
        key: 'analytics_last_refreshed_at',
        value: new Date().toISOString(),
      },
      { managed: false },
    );
    await fork.upsert(SystemConfig, config, { onConflictFields: ['key'] });
    await fork.flush();

    const duration = Date.now() - start;
    this.logger.log(`Analytics refresh completed in ${duration}ms`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<AnalyticsRefreshJobData>, error: Error) {
    this.logger.error(
      `Analytics refresh job ${job.id} failed on attempt ${job.attemptsMade}: ${error.message}`,
    );
  }
}
