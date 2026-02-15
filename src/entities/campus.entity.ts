import {
  Collection,
  Entity,
  Index,
  OneToMany,
  Property,
} from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { Semester } from './semester.entity';

@Entity()
export class Campus extends CustomBaseEntity {
  @Property({ unique: true })
  @Index()
  moodleCategoryId!: number;

  @Property()
  code!: string; // UCMN, UCB, UCLM

  @Property({ nullable: true })
  name?: string;

  @OneToMany(() => Semester, (semester) => semester.campus)
  semesters = new Collection<Semester>(this);
}
