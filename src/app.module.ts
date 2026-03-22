import { Module, OnApplicationBootstrap } from '@nestjs/common';
import {
  ApplicationModules,
  InfrastructureModules,
} from './modules/index.module';
import { AllCronJobs } from './crons/index.jobs';
import { StartupJobRegistry } from './crons/startup-job-registry';
import { env } from './configurations/env';
import { CommonModule } from './modules/common/common.module';
import { MoodleStartupService } from './modules/moodle/services/moodle-startup.service';

@Module({
  // CommonModule imported directly so cron job providers can inject RefreshTokenRepository
  imports: [...InfrastructureModules, ...ApplicationModules, CommonModule],
  providers: [...AllCronJobs],
})
export default class AppModule implements OnApplicationBootstrap {
  constructor(private readonly moodleStartupService: MoodleStartupService) {}

  async onApplicationBootstrap() {
    if (env.OPENAPI_MODE) return;
    await this.moodleStartupService.RunStartupSync();
    StartupJobRegistry.printSummary();
  }
}
