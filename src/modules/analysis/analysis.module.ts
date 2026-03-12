import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AnalysisService } from './analysis.service';
import { SentimentProcessor } from './processors/sentiment.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'sentiment' })],
  providers: [AnalysisService, SentimentProcessor],
  exports: [AnalysisService],
})
export class AnalysisModule {}
