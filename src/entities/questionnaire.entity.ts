import {
  Entity,
  Property,
  OneToMany,
  Collection,
  Enum,
  ManyToOne,
  Unique,
} from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { QuestionnaireRepository } from '../repositories/questionnaire.repository';
import { QuestionnaireStatus } from '../modules/questionnaires/lib/questionnaire.types';
import { QuestionnaireVersion } from './questionnaire-version.entity';
import { QuestionnaireType } from './questionnaire-type.entity';

@Entity({ repository: () => QuestionnaireRepository })
@Unique({ properties: ['type'] })
export class Questionnaire extends CustomBaseEntity {
  @Property()
  title!: string;

  @Enum(() => QuestionnaireStatus)
  status: QuestionnaireStatus = QuestionnaireStatus.DRAFT;

  @ManyToOne(() => QuestionnaireType)
  type!: QuestionnaireType;

  @OneToMany(() => QuestionnaireVersion, (v) => v.questionnaire)
  versions = new Collection<QuestionnaireVersion>(this);
}
