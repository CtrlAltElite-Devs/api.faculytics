import { Entity, Index, Property } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';

@Entity()
export class MoodleCategory extends CustomBaseEntity {
  @Property({ unique: true })
  @Index()
  moodleCategoryId!: number;

  @Property()
  name!: string;

  @Property({ nullable: true })
  description?: string;

  @Property()
  parentMoodleCategoryId!: number;

  @Property()
  depth!: number;

  @Property()
  path!: string;

  @Property()
  sortOrder!: number;

  @Property()
  isVisible!: boolean;

  @Property()
  timeModified!: Date;
}
