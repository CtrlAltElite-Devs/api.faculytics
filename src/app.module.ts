import { Module } from '@nestjs/common';
import {
  ApplicationModules,
  InfrastructureModules,
} from './modules/index.module';

@Module({
  imports: [...InfrastructureModules, ...ApplicationModules],
})
export default class AppModule {}
