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
  private userLoader: DataLoader<string, User | null>;
  private courseLoader: DataLoader<string, Course | null>;
  private semesterLoader: DataLoader<number, Semester | null>;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: UserRepository,
    @InjectRepository(Course)
    private readonly courseRepository: EntityRepository<Course>,
    @InjectRepository(Semester)
    private readonly semesterRepository: EntityRepository<Semester>,
  ) {
    this.userLoader = new DataLoader<string, User | null>(
      async (usernames: readonly string[]) => {
        const users = await this.userRepository.find(
          {
            userName: { $in: [...usernames] },
          },
          {
            populate: ['campus', 'department', 'program'],
          },
        );
        const map = new Map(users.map((u) => [u.userName, u]));
        return usernames.map((username) => map.get(username) ?? null);
      },
    );

    this.courseLoader = new DataLoader<string, Course | null>(
      async (shortnames: readonly string[]) => {
        // PERF: Deep population of institutional context is necessary for mapping
        // but can be expensive for very diverse batches.
        const courses = await this.courseRepository.find(
          {
            shortname: { $in: [...shortnames] },
          },
          {
            populate: ['program.department.semester'],
          },
        );
        const map = new Map(courses.map((c) => [c.shortname, c]));
        return shortnames.map((shortname) => map.get(shortname) ?? null);
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

  loadUser(username: string): Promise<User | null> {
    return this.userLoader.load(username);
  }

  loadCourse(shortname: string): Promise<Course | null> {
    return this.courseLoader.load(shortname);
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
