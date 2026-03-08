import { Module, OnApplicationBootstrap } from '@nestjs/common';
import {
  ApplicationModules,
  InfrastructureModules,
} from './modules/index.module';
import { AllCronJobs } from './crons/index.jobs';
import { CategorySyncJob } from './crons/jobs/category-jobs/category-sync.job';
import { CourseSyncJob } from './crons/jobs/course-jobs/course-sync.job';
import { EnrollmentSyncJob } from './crons/jobs/enrollment-jobs/enrollment-sync.job';
import { StartupJobRegistry } from './crons/startup-job-registry';
import { env } from './configurations/env';
import { CommonModule } from './modules/common/common.module';

@Module({
  // CommonModule imported directly so cron job providers can inject RefreshTokenRepository
  imports: [...InfrastructureModules, ...ApplicationModules, CommonModule],
  providers: [...AllCronJobs],
})
export default class AppModule implements OnApplicationBootstrap {
  constructor(
    private readonly categorySyncJob: CategorySyncJob,
    private readonly courseSyncJob: CourseSyncJob,
    private readonly enrollmentSyncJob: EnrollmentSyncJob,
  ) {}

  async onApplicationBootstrap() {
    if (env.OPENAPI_MODE) return;
    await this.categorySyncJob.executeStartup();
    if (env.SYNC_ON_STARTUP) {
      await this.courseSyncJob.executeStartup();
      await this.enrollmentSyncJob.executeStartup();
    }
    StartupJobRegistry.printSummary();
  }
}
