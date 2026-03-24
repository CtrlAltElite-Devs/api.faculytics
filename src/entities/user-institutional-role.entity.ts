import { Entity, ManyToOne, Property, Unique } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { User } from './user.entity';
import { MoodleCategory } from './moodle-category.entity';

export enum InstitutionalRoleSource {
  AUTO = 'auto',
  MANUAL = 'manual',
}

@Entity()
@Unique({ properties: ['user', 'moodleCategory', 'role'] })
export class UserInstitutionalRole extends CustomBaseEntity {
  @ManyToOne(() => User)
  user!: User;

  @Property()
  role!: string;

  @ManyToOne(() => MoodleCategory)
  moodleCategory!: MoodleCategory;

  @Property({ default: InstitutionalRoleSource.AUTO })
  source!: string;
}
