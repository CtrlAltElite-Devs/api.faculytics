import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { JobRecordType, StartupJobRegistry } from './startup-job-registry';

export abstract class BaseJob implements OnApplicationShutdown {
  protected readonly logger: Logger;

  protected constructor(
    protected readonly schedulerRegistry: SchedulerRegistry,
    private readonly jobName: string,
  ) {
    this.logger = new Logger(jobName);
  }

  // 🔹 Executed in sequence during app bootstrap
  async executeStartup() {
    await Promise.resolve();
    this.logger.log(`Running startup check for ${this.jobName}...`);
    try {
      const result = await this.runStartupTask();
      StartupJobRegistry.record(this.jobName, result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Startup execution failed for ${this.jobName}:`,
        message,
      );
      StartupJobRegistry.record(this.jobName, {
        status: 'failed',
        details: message,
      });
    }
  }

  // 🔹 Each child must implement what to do at startup
  protected abstract runStartupTask(): Promise<JobRecordType>;

  // 🔹 Called on graceful shutdown
  async onApplicationShutdown(signal?: string) {
    await Promise.resolve();
    this.logger.log(
      `🛑 ${this.jobName} shutting down${signal ? ` due to ${signal}` : ''}.`,
    );
  }
}
