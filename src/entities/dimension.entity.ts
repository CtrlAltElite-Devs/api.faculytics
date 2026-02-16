import { Entity, Property, Index, Enum, Unique } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { DimensionRepository } from '../repositories/dimension.repository';
import { QuestionnaireType } from '../modules/questionnaires/questionnaire.types';

@Entity({ repository: () => DimensionRepository })
@Unique({ properties: ['code', 'questionnaireType'] })
export class Dimension extends CustomBaseEntity {
  @Property()
  @Index()
  code!: string;

  @Property()
  displayName!: string;

  @Enum(() => QuestionnaireType)
  questionnaireType!: QuestionnaireType;

  @Property({ default: true })
  active: boolean = true;
}
