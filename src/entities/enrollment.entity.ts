import { Entity, Index, ManyToOne, Property, Unique } from '@mikro-orm/core';
import { Course } from './course.entity';
import { CustomBaseEntity } from './base.entity';
import { User } from './user.entity';

@Entity()
@Unique({ properties: ['user', 'course'] })
export class Enrollment extends CustomBaseEntity {
  @ManyToOne(() => User)
  @Index()
  user!: User;

  @ManyToOne(() => Course)
  @Index()
  course!: Course;

  @Property()
  role!: string; // student, teacher, etc.

  @Property({ default: true })
  isActive!: boolean;

  @Property()
  timeModified!: Date;
}
