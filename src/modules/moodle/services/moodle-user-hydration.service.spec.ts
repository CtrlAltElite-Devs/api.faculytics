import { Test, TestingModule } from '@nestjs/testing';
import { MoodleUserHydrationService } from './moodle-user-hydration.service';
import { MoodleService } from '../moodle.service';
import UnitOfWork from 'src/modules/common/unit-of-work';
import { User } from 'src/entities/user.entity';
import { Program } from 'src/entities/program.entity';
import { Department } from 'src/entities/department.entity';
import { Course } from 'src/entities/course.entity';
import { Section } from 'src/entities/section.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import {
  UserInstitutionalRole,
  InstitutionalRoleSource,
} from 'src/entities/user-institutional-role.entity';

const makeDepartment = (id: string): Department =>
  ({ id, name: `dept-${id}` }) as Department;

const makeProgram = (
  id: string,
  moodleCategoryId: number,
  department: Department,
): Program => ({ id, moodleCategoryId, department }) as unknown as Program;

interface FakeTx {
  findOneOrFail: jest.Mock;
  findOne: jest.Mock;
  find: jest.Mock;
  upsert: jest.Mock;
  populate: jest.Mock;
  persist: jest.Mock;
  flush: jest.Mock;
  remove: jest.Mock;
  create: jest.Mock;
}

const buildTx = (user: User, program: Program, course: Course): FakeTx => {
  const tx: FakeTx = {
    findOneOrFail: jest.fn((entity: unknown) => {
      if (entity === User) return Promise.resolve(user);
      return Promise.reject(
        new Error(`unexpected findOneOrFail for ${String(entity)}`),
      );
    }),
    findOne: jest.fn((entity: unknown) => {
      if (entity === Program) return Promise.resolve(program);
      return Promise.resolve(null);
    }),
    find: jest.fn((entity: unknown) => {
      if (entity === Enrollment) return Promise.resolve([]);
      if (entity === UserInstitutionalRole) return Promise.resolve([]);
      return Promise.resolve([]);
    }),
    upsert: jest.fn((entity: unknown, data: unknown) => {
      if (entity === Course) return Promise.resolve(course);
      if (entity === Section) return Promise.resolve(data);
      if (entity === Enrollment) return Promise.resolve(data);
      return Promise.resolve(data);
    }),
    populate: jest.fn(() => Promise.resolve(undefined)),
    persist: jest.fn(),
    flush: jest.fn(() => Promise.resolve(undefined)),
    remove: jest.fn(),
    create: jest.fn((_entity: unknown, data: unknown) => data),
  };
  return tx;
};

const buildMoodleService = (course: Course): Partial<MoodleService> => ({
  GetEnrolledCourses: jest.fn(() =>
    Promise.resolve([
      {
        id: course.id ?? 1,
        shortname: 'cs101',
        fullname: 'CS 101',
        category: 100,
        startdate: 0,
        enddate: 0,
        visible: 1,
        timemodified: 0,
        courseimage: null,
      } as never,
    ]),
  ),
  GetCourseUserProfiles: jest.fn(() =>
    Promise.resolve([{ roles: [] } as never]),
  ),
  GetCourseGroups: jest.fn(() => Promise.resolve([])),
  GetCourseUserGroups: jest.fn(() => Promise.resolve({ groups: [] } as never)),
  GetUsersWithCapability: jest.fn(() => Promise.resolve([])),
  ExtractRole: jest.fn(() => 'student'),
});

describe('MoodleUserHydrationService scope derivation', () => {
  let service: MoodleUserHydrationService;
  let tx: FakeTx;
  let unitOfWork: UnitOfWork;

  const setup = async (user: User) => {
    const dept = makeDepartment('d1');
    const program = makeProgram('p1', 100, dept);
    const course = {
      id: 'course-1',
      program,
    } as unknown as Course;

    tx = buildTx(user, program, course);
    unitOfWork = {
      runInTransaction: jest.fn((work: (em: unknown) => Promise<void>) =>
        work(tx),
      ),
    } as unknown as UnitOfWork;

    const moodleService = buildMoodleService(course);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MoodleUserHydrationService,
        { provide: MoodleService, useValue: moodleService },
        { provide: UnitOfWork, useValue: unitOfWork },
      ],
    }).compile();

    service = module.get(MoodleUserHydrationService);

    return { dept, program, course };
  };

  it('derives department/program for auto/auto user', async () => {
    const user = {
      id: 'u1',
      moodleUserId: 42,
      userName: 'jdoe',
      departmentSource: InstitutionalRoleSource.AUTO,
      programSource: InstitutionalRoleSource.AUTO,
      roles: [],
      updateRolesFromEnrollments: jest.fn(),
    } as unknown as User;

    const { dept, program } = await setup(user);

    await service.hydrateUserCourses(42, 'token');

    expect(user.program).toBe(program);
    expect(user.department).toBe(dept);
    expect(user.programSource).toBe(InstitutionalRoleSource.AUTO);
    expect(user.departmentSource).toBe(InstitutionalRoleSource.AUTO);
  });

  it('does NOT modify scope when departmentSource = manual', async () => {
    const user = {
      id: 'u1',
      moodleUserId: 42,
      userName: 'jdoe',
      departmentSource: InstitutionalRoleSource.MANUAL,
      programSource: InstitutionalRoleSource.AUTO,
      program: undefined,
      department: undefined,
      roles: [],
      updateRolesFromEnrollments: jest.fn(),
    } as unknown as User;

    await setup(user);

    await service.hydrateUserCourses(42, 'token');

    expect(user.program).toBeUndefined();
    expect(user.department).toBeUndefined();
  });

  it('does NOT modify scope when programSource = manual', async () => {
    const user = {
      id: 'u1',
      moodleUserId: 42,
      userName: 'jdoe',
      departmentSource: InstitutionalRoleSource.AUTO,
      programSource: InstitutionalRoleSource.MANUAL,
      program: undefined,
      department: undefined,
      roles: [],
      updateRolesFromEnrollments: jest.fn(),
    } as unknown as User;

    await setup(user);

    await service.hydrateUserCourses(42, 'token');

    expect(user.program).toBeUndefined();
    expect(user.department).toBeUndefined();
  });

  it('does not modify user.campus during scope derivation (AC12)', async () => {
    const initialCampus = { id: 'campus-1', code: 'MAIN' } as never;
    const user = {
      id: 'u1',
      moodleUserId: 42,
      userName: 'jdoe',
      departmentSource: InstitutionalRoleSource.AUTO,
      programSource: InstitutionalRoleSource.AUTO,
      campus: initialCampus,
      roles: [],
      updateRolesFromEnrollments: jest.fn(),
    } as unknown as User;

    await setup(user);

    await service.hydrateUserCourses(42, 'token');

    // The same campus reference must survive hydration's scope step.
    expect(user.campus).toBe(initialCampus);
  });
});
