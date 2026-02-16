import {
  Entity,
  Property,
  ManyToOne,
  Enum,
  Index,
  OneToMany,
  Collection,
  Unique,
} from '@mikro-orm/core';
import { CustomBaseEntity } from './base.entity';
import { QuestionnaireSubmissionRepository } from '../repositories/questionnaire-submission.repository';
import { QuestionnaireVersion } from './questionnaire-version.entity';
import { User } from './user.entity';
import { Semester } from './semester.entity';
import { Course } from './course.entity';
import { Department } from './department.entity';
import { Program } from './program.entity';
import { Campus } from './campus.entity';
import { RespondentRole } from '../modules/questionnaires/questionnaire.types';
import { QuestionnaireAnswer } from './questionnaire-answer.entity';

@Entity({ repository: () => QuestionnaireSubmissionRepository })
@Unique({
  properties: [
    'respondent',
    'faculty',
    'questionnaireVersion',
    'semester',
    'course',
  ],
})
@Index({ properties: ['faculty', 'semester'] })
@Index({ properties: ['department', 'semester'] })
@Index({ properties: ['program', 'semester'] })
@Index({ properties: ['campus', 'semester'] })
@Index({ properties: ['questionnaireVersion'] })
export class QuestionnaireSubmission extends CustomBaseEntity {
  @ManyToOne(() => QuestionnaireVersion)
  questionnaireVersion!: QuestionnaireVersion;

  @ManyToOne(() => User)
  respondent!: User;

  @ManyToOne(() => User)
  faculty!: User;

  @Enum(() => RespondentRole)
  respondentRole!: RespondentRole;

  @ManyToOne(() => Semester)
  semester!: Semester;

  @ManyToOne(() => Course, { nullable: true })
  course?: Course;

  @ManyToOne(() => Department)
  department!: Department;

  @ManyToOne(() => Program)
  program!: Program;

  @ManyToOne(() => Campus)
  campus!: Campus;

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  totalScore!: number;

  @Property({ type: 'decimal', precision: 10, scale: 2 })
  normalizedScore!: number;

  @Property({ type: 'text', nullable: true })
  qualitativeComment?: string;

  @Property({ defaultRaw: 'now()' })
  submittedAt: Date = new Date();

  // Faculty Snapshots
  @Property()
  facultyNameSnapshot!: string;

  @Property({ nullable: true })
  facultyEmployeeNumberSnapshot?: string;

  // Department Snapshots
  @Property()
  departmentCodeSnapshot!: string;

  @Property()
  departmentNameSnapshot!: string;

  // Program Snapshots
  @Property()
  programCodeSnapshot!: string;

  @Property()
  programNameSnapshot!: string;

  // Campus Snapshots
  @Property()
  campusCodeSnapshot!: string;

  @Property()
  campusNameSnapshot!: string;

  // Course Snapshots
  @Property({ nullable: true })
  courseCodeSnapshot?: string;

  @Property({ nullable: true })
  courseTitleSnapshot?: string;

  // Semester Snapshots
  @Property()
  semesterCodeSnapshot!: string;

  @Property()
  semesterLabelSnapshot!: string;

  @Property()
  academicYearSnapshot!: string;

  @OneToMany(() => QuestionnaireAnswer, (a) => a.submission)
  answers = new Collection<QuestionnaireAnswer>(this);
}
