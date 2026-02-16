import { Entity, Property, OneToMany, Collection, Enum } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { QuestionnaireRepository } from '../repositories/questionnaire.repository';
import {
  QuestionnaireStatus,
  QuestionnaireType,
} from '../modules/questionnaires/questionnaire.types';
import { QuestionnaireVersion } from './questionnaire-version.entity';

@Entity({ repository: () => QuestionnaireRepository })
export class Questionnaire extends CustomBaseEntity {
  @Property()
  title!: string;

  @Enum(() => QuestionnaireStatus)
  status: QuestionnaireStatus = QuestionnaireStatus.DRAFT;

  @Enum(() => QuestionnaireType)
  type!: QuestionnaireType;

  @OneToMany(() => QuestionnaireVersion, (v) => v.questionnaire)
  versions = new Collection<QuestionnaireVersion>(this);
}
