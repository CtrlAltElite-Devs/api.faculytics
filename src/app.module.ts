import { Module } from '@nestjs/common';
import { ApplicationModules } from './modules/index.module';

@Module({
  imports: [...ApplicationModules],
})
export default class AppModule {}
