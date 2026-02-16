import { Entity, Property, ManyToOne } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { QuestionnaireAnswerRepository } from '../repositories/questionnaire-answer.repository';
import { QuestionnaireSubmission } from './questionnaire-submission.entity';

@Entity({ repository: () => QuestionnaireAnswerRepository })
export class QuestionnaireAnswer extends CustomBaseEntity {
  @ManyToOne(() => QuestionnaireSubmission)
  submission!: QuestionnaireSubmission;

  @Property()
  questionId!: string;

  @Property()
  sectionId!: string;

  @Property()
  dimensionCode!: string;

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  numericValue!: number;
}
