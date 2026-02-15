import { Module, OnApplicationBootstrap } from '@nestjs/common';
import {
  ApplicationModules,
  InfrastructureModules,
} from './modules/index.module';
import { AllCronJobs } from './crons/index.jobs';
import { CategorySyncJob } from './crons/jobs/category-jobs/category-sync.job';
import { StartupJobRegistry } from './crons/startup-job-registry';

@Module({
  imports: [...InfrastructureModules, ...ApplicationModules],
  providers: [...AllCronJobs],
})
export default class AppModule implements OnApplicationBootstrap {
  constructor(private readonly categorySyncJob: CategorySyncJob) {}

  async onApplicationBootstrap() {
    await this.categorySyncJob.executeStartup();
    StartupJobRegistry.printSummary();
  }
}
