import {
  Property,
  Index,
  ManyToOne,
  OneToMany,
  Collection,
  Entity,
} from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { Department } from './department.entity';
import { Course } from './course.entity';

@Entity()
export class Program extends CustomBaseEntity {
  @Property({ unique: true })
  @Index()
  moodleCategoryId!: number;

  @Property()
  code!: string; // BSCS, BSIT

  @Property({ nullable: true })
  name?: string;

  @ManyToOne(() => Department)
  department!: Department;

  @OneToMany(() => Course, (course) => course.program)
  courses = new Collection<Course>(this);
}
