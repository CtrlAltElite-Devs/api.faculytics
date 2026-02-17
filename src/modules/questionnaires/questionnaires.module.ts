import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import {
  Questionnaire,
  QuestionnaireVersion,
  QuestionnaireSubmission,
  QuestionnaireAnswer,
  Dimension,
  Enrollment,
} from '../../entities/index.entity';
import { QuestionnaireService } from './services/questionnaire.service';
import { QuestionnaireController } from './questionnaire.controller';
import { QuestionnaireSchemaValidator } from './services/questionnaire-schema.validator';
import { ScoringService } from './services/scoring.service';
import { SourceAdapterFactory } from './ingestion/factories/source-adapter.factory';
import { SOURCE_ADAPTER_PREFIX } from './ingestion/constants/ingestion.constants';
import { SourceType } from './ingestion/types/source-type.enum';
import { ErrorFormatter } from './ingestion/utils/error-formatter.util';
import { IngestionEngine } from './ingestion/services/ingestion-engine.service';
import { IngestionMapperService } from './ingestion/services/ingestion-mapper.service';
import DataLoaderModule from '../common/data-loaders/index.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([
      Questionnaire,
      QuestionnaireVersion,
      QuestionnaireSubmission,
      QuestionnaireAnswer,
      Dimension,
      Enrollment,
    ]),
    DataLoaderModule,
  ],
  controllers: [QuestionnaireController],
  providers: [
    QuestionnaireService,
    QuestionnaireSchemaValidator,
    ScoringService,
    SourceAdapterFactory,
    ErrorFormatter,
    IngestionEngine,
    IngestionMapperService,
    {
      provide: `${SOURCE_ADAPTER_PREFIX}${SourceType.CSV}`,
      useValue: {}, // Placeholder
    },
    {
      provide: `${SOURCE_ADAPTER_PREFIX}${SourceType.EXCEL}`,
      useValue: {}, // Placeholder
    },
  ],
  exports: [QuestionnaireService],
})
export class QuestionnaireModule {}
