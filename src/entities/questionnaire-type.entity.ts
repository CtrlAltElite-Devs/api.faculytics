import { Entity, Property, Index } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { QuestionnaireTypeRepository } from '../repositories/questionnaire-type.repository';

@Index({
  name: 'questionnaire_type_code_unique',
  expression:
    'create unique index "questionnaire_type_code_unique" on "questionnaire_type" ("code") where "deleted_at" is null',
})
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
