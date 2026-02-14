import {
  Property,
  Index,
  ManyToOne,
  OneToMany,
  Collection,
  Entity,
} from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { Semester } from './semester.entity';
import { Program } from './program.entity';

@Entity()
export class Department extends CustomBaseEntity {
  @Property({ unique: true })
  @Index()
  moodleCategoryId!: number;

  @Property()
  code!: string; // CCS

  @Property({ nullable: true })
  name?: string;

  @ManyToOne(() => Semester)
  semester!: Semester;

  @OneToMany(() => Program, (program) => program.department)
  programs = new Collection<Program>(this);
}
