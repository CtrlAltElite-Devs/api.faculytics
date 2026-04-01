import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { QueueName } from 'src/configurations/common/queue-names';
import { ReportJob } from 'src/entities/report-job.entity';
import { CommonModule } from '../common/common.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import DataLoaderModule from '../common/data-loaders/index.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { ReportGenerationProcessor } from './processors/report-generation.processor';
import { PdfService } from './services/pdf.service';
import { R2StorageService } from './services/r2-storage.service';
import { STORAGE_PROVIDER } from './interfaces/storage-provider.interface';
import { ReportCleanupJob } from './jobs/report-cleanup.job';

@Module({
  imports: [
    BullModule.registerQueue({ name: QueueName.REPORT_GENERATION }),
    MikroOrmModule.forFeature([ReportJob]),
    CommonModule,
    AnalyticsModule,
    DataLoaderModule,
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportGenerationProcessor,
    PdfService,
    { provide: STORAGE_PROVIDER, useClass: R2StorageService },
    ReportCleanupJob,
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
