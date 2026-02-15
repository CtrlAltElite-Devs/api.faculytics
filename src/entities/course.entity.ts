import { Property, Index, ManyToOne, Entity, Unique } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { Program } from './program.entity';

@Entity()
@Unique({ properties: ['moodleCourseId'] })
export class Course extends CustomBaseEntity {
  @Property({ unique: true })
  @Index()
  moodleCourseId!: number;

  @Property()
  shortname!: string;

  @Property()
  fullname!: string;

  @ManyToOne(() => Program)
  program!: Program;

  @Property()
  startDate!: Date;

  @Property()
  endDate!: Date;

  @Property()
  isVisible!: boolean;

  @Property()
  timeModified!: Date;

  @Property({ default: true })
  isActive!: boolean;
}
