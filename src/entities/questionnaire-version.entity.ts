import { Entity, Property, ManyToOne, Unique } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { QuestionnaireVersionRepository } from '../repositories/questionnaire-version.repository';
import { Questionnaire } from './questionnaire.entity';
import type { QuestionnaireSchemaSnapshot } from '../modules/questionnaires/questionnaire.types';

@Entity({ repository: () => QuestionnaireVersionRepository })
@Unique({ properties: ['questionnaire', 'versionNumber'] })
export class QuestionnaireVersion extends CustomBaseEntity {
  @ManyToOne(() => Questionnaire)
  questionnaire!: Questionnaire;

  @Property()
  versionNumber!: number;

  @Property({ type: 'json' })
  schemaSnapshot!: QuestionnaireSchemaSnapshot;

  @Property({ nullable: true })
  publishedAt?: Date;

  @Property({ default: false })
  isActive: boolean = false;
}
