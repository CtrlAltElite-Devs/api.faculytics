import { Injectable, Scope } from '@nestjs/common';
import DataLoader from 'dataloader';
import { User } from 'src/entities/user.entity';
import { Course } from 'src/entities/course.entity';
import { Semester } from 'src/entities/semester.entity';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/postgresql';
import { UserRepository } from 'src/repositories/user.repository';

@Injectable({ scope: Scope.REQUEST })
export class IngestionMappingLoader {
  private userLoader: DataLoader<number, User | null>;
  private courseLoader: DataLoader<number, Course | null>;
  private semesterLoader: DataLoader<number, Semester | null>;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: UserRepository,
    @InjectRepository(Course)
    private readonly courseRepository: EntityRepository<Course>,
    @InjectRepository(Semester)
    private readonly semesterRepository: EntityRepository<Semester>,
  ) {
    this.userLoader = new DataLoader<number, User | null>(
      async (ids: readonly number[]) => {
        const users = await this.userRepository.find(
          {
            moodleUserId: { $in: [...ids] },
          },
          {
            populate: ['campus', 'department', 'program'],
          },
        );
        const map = new Map(users.map((u) => [u.moodleUserId, u]));
        return ids.map((id) => map.get(id) ?? null);
      },
    );

    this.courseLoader = new DataLoader<number, Course | null>(
      async (ids: readonly number[]) => {
        // PERF: Deep population of institutional context is necessary for mapping
        // but can be expensive for very diverse batches.
        const courses = await this.courseRepository.find(
          {
            moodleCourseId: { $in: [...ids] },
          },
          {
            populate: ['program.department.semester'],
          },
        );
        const map = new Map(courses.map((c) => [c.moodleCourseId, c]));
        return ids.map((id) => map.get(id) ?? null);
      },
    );

    this.semesterLoader = new DataLoader<number, Semester | null>(
      async (ids: readonly number[]) => {
        const semesters = await this.semesterRepository.find({
          moodleCategoryId: { $in: [...ids] },
        });
        const map = new Map(semesters.map((s) => [s.moodleCategoryId, s]));
        return ids.map((id) => map.get(id) ?? null);
      },
    );
  }

  loadUser(moodleUserId: number): Promise<User | null> {
    return this.userLoader.load(moodleUserId);
  }

  loadCourse(moodleCourseId: number): Promise<Course | null> {
    return this.courseLoader.load(moodleCourseId);
  }

  loadSemester(moodleCategoryId: number): Promise<Semester | null> {
    return this.semesterLoader.load(moodleCategoryId);
  }

  clearAll() {
    this.userLoader.clearAll();
    this.courseLoader.clearAll();
    this.semesterLoader.clearAll();
  }
}
