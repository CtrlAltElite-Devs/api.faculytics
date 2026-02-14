import { Module } from '@nestjs/common';
import {
  ApplicationModules,
  InfrastructureModules,
} from './modules/index.module';
import { AllCronJobs } from './crons/index.jobs';

@Module({
  imports: [...InfrastructureModules, ...ApplicationModules],
  providers: [...AllCronJobs],
})
export default class AppModule {}
