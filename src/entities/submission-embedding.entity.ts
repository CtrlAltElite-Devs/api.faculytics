import { Entity, Index, ManyToOne, Property } from '@mikro-orm/core';
import { VectorType } from 'pgvector/mikro-orm';
import { CustomBaseEntity } from './base.entity';
import { QuestionnaireSubmission } from './questionnaire-submission.entity';
import { SubmissionEmbeddingRepository } from '../repositories/submission-embedding.repository';

@Entity({ repository: () => SubmissionEmbeddingRepository })
@Index({ properties: ['submission'] })
export class SubmissionEmbedding extends CustomBaseEntity {
  @ManyToOne(() => QuestionnaireSubmission)
  submission!: QuestionnaireSubmission;

  @Property({ type: VectorType, length: 768 })
  embedding!: number[];

  @Property()
  modelName!: string;
}
