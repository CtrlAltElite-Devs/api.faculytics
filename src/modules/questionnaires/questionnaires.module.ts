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
  ],
  controllers: [QuestionnaireController],
  providers: [
    QuestionnaireService,
    QuestionnaireSchemaValidator,
    ScoringService,
  ],
  exports: [QuestionnaireService],
})
export class QuestionnaireModule {}
