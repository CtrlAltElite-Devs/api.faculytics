import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { QueueName } from 'src/configurations/common/queue-names';
import { User } from 'src/entities/user.entity';
import { CommonModule } from '../common/common.module';
import DataLoaderModule from '../common/data-loaders/index.module';
import { AnalyticsService } from './analytics.service';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsRefreshProcessor } from './processors/analytics-refresh.processor';

@Module({
  imports: [
    MikroOrmModule.forFeature([User]),
    CommonModule,
    DataLoaderModule,
    BullModule.registerQueue({ name: QueueName.ANALYTICS_REFRESH }),
  ],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsRefreshProcessor],
})
export class AnalyticsModule {}
