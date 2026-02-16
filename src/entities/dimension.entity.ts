import { Entity, Property, Index, Enum } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { DimensionRepository } from '../repositories/dimension.repository';
import { QuestionnaireType } from '../modules/questionnaires/questionnaire.types';

@Entity({ repository: () => DimensionRepository })
export class Dimension extends CustomBaseEntity {
  @Property({ unique: true })
  @Index()
  code!: string;

  @Property()
  displayName!: string;

  @Enum(() => QuestionnaireType)
  questionnaireType!: QuestionnaireType;

  @Property({ default: true })
  active: boolean = true;
}
