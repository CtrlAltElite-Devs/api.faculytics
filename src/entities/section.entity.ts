import { Entity, Index, ManyToOne, Property, Unique } from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { Course } from './course.entity';

@Entity()
@Unique({ properties: ['moodleGroupId'] })
export class Section extends CustomBaseEntity {
  @Property({ unique: true })
  @Index()
  moodleGroupId!: number;

  @Property()
  name!: string;

  @Property({ nullable: true })
  description?: string;

  @ManyToOne(() => Course)
  @Index()
  course!: Course;
}
