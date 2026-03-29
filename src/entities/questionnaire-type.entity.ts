import { Entity, Property, Index } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { QuestionnaireTypeRepository } from '../repositories/questionnaire-type.repository';

@Entity({ repository: () => QuestionnaireTypeRepository })
export class QuestionnaireType extends CustomBaseEntity {
  @Property()
  name!: string;

  @Property()
  @Index()
  code!: string;

  @Property({ nullable: true })
  description?: string;

  @Property({ default: false })
  isSystem: boolean = false;
}
