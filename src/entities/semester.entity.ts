import {
  Property,
  Index,
  ManyToOne,
  OneToMany,
  Collection,
  Entity,
} from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { Campus } from './campus.entity';
import { Department } from './department.entity';

@Entity()
export class Semester extends CustomBaseEntity {
  @Property({ unique: true })
  @Index()
  moodleCategoryId!: number;

  @Property()
  code!: string; // S22526

  @Property({ nullable: true })
  label?: string;

  @Property({ nullable: true })
  academicYear?: string;

  @ManyToOne(() => Campus)
  campus!: Campus;

  @OneToMany(() => Department, (department) => department.semester)
  departments = new Collection<Department>(this);

  @Property({ nullable: true })
  description?: string;
}
