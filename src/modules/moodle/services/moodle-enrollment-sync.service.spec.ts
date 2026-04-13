import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/core';
import { Logger } from '@nestjs/common';
import { EnrollmentSyncService } from './moodle-enrollment-sync.service';
import { MoodleService } from '../moodle.service';
import UnitOfWork from 'src/modules/common/unit-of-work';
import { Campus } from 'src/entities/campus.entity';
import { Course } from 'src/entities/course.entity';
import { Program } from 'src/entities/program.entity';
import { Department } from 'src/entities/department.entity';
import { User } from 'src/entities/user.entity';
import { InstitutionalRoleSource } from 'src/entities/user-institutional-role.entity';
import { MoodleEnrolledUser } from '../lib/moodle.types';

const makeDepartment = (id: string): Department =>
  ({ id, name: `dept-${id}` }) as Department;

const makeProgram = (
  id: string,
  moodleCategoryId: number,
  department: Department,
): Program => ({ id, moodleCategoryId, department }) as unknown as Program;

const makeCourse = (program: Program): Course =>
  ({ program }) as unknown as Course;

const makeRemoteUser = (id: number, username: string): MoodleEnrolledUser =>
  ({ id, username }) as unknown as MoodleEnrolledUser;

const makeUser = (overrides: Partial<User>): User => {
  const u = {
    id: overrides.id ?? `user-${Math.random()}`,
    moodleUserId: overrides.moodleUserId,
    userName: 'jdoe',
    departmentSource: InstitutionalRoleSource.AUTO,
    programSource: InstitutionalRoleSource.AUTO,
    program: undefined,
    department: undefined,
    ...overrides,
  } as unknown as User;
  return u;
};

const makeCampus = (id: string, code: string): Campus =>
  ({ id, code }) as unknown as Campus;

interface FakeFork {
  find: jest.Mock;
  populate: jest.Mock;
  flush: jest.Mock;
}

const buildFork = (
  programs: Program[],
  users: User[],
  campuses: Campus[] = [],
): FakeFork => {
  return {
    find: jest.fn((entity: unknown) => {
      if (entity === Program) return Promise.resolve(programs);
      if (entity === User) return Promise.resolve(users);
      if (entity === Campus) return Promise.resolve(campuses);
      return Promise.resolve([]);
    }),
    populate: jest.fn(() => Promise.resolve(undefined)),
    flush: jest.fn(() => Promise.resolve(undefined)),
  };
};

describe('EnrollmentSyncService.backfillUserScopes', () => {
  let service: EnrollmentSyncService;
  let em: { fork: jest.Mock };
  let loggerSpy: jest.SpyInstance;

  const setup = async (fork: FakeFork) => {
    em = { fork: jest.fn(() => fork) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentSyncService,
        { provide: EntityManager, useValue: em },
        { provide: MoodleService, useValue: {} },
        { provide: UnitOfWork, useValue: {} },
      ],
    }).compile();

    service = module.get(EnrollmentSyncService);
    loggerSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
  };

  afterEach(() => {
    loggerSpy?.mockRestore();
  });

  it('derives and updates auto/auto user from enrollments', async () => {
    const dept = makeDepartment('d1');
    const program = makeProgram('p1', 100, dept);
    const course = makeCourse(program);
    const user = makeUser({ id: 'u1', moodleUserId: 42 });

    const fork = buildFork([program], [user]);
    await setup(fork);

    await service['backfillUserScopes']([
      { course, remoteUsers: [makeRemoteUser(42, 'jdoe')] },
    ]);

    expect(user.program).toBe(program);
    expect(user.department).toBe(dept);
    expect(user.programSource).toBe(InstitutionalRoleSource.AUTO);
    expect(user.departmentSource).toBe(InstitutionalRoleSource.AUTO);
    expect(fork.flush).toHaveBeenCalledTimes(1);
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('1 derived'),
    );
  });

  it('skips user atomically when departmentSource = manual', async () => {
    const dept = makeDepartment('d1');
    const program = makeProgram('p1', 100, dept);
    const course = makeCourse(program);
    const user = makeUser({
      id: 'u1',
      moodleUserId: 42,
      departmentSource: InstitutionalRoleSource.MANUAL,
    });

    const fork = buildFork([program], [user]);
    await setup(fork);

    await service['backfillUserScopes']([
      { course, remoteUsers: [makeRemoteUser(42, 'jdoe')] },
    ]);

    expect(user.program).toBeUndefined();
    expect(user.department).toBeUndefined();
    expect(fork.flush).not.toHaveBeenCalled();
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('1 manual skipped'),
    );
  });

  it('skips user atomically when programSource = manual', async () => {
    const dept = makeDepartment('d1');
    const program = makeProgram('p1', 100, dept);
    const course = makeCourse(program);
    const user = makeUser({
      id: 'u1',
      moodleUserId: 42,
      programSource: InstitutionalRoleSource.MANUAL,
    });

    const fork = buildFork([program], [user]);
    await setup(fork);

    await service['backfillUserScopes']([
      { course, remoteUsers: [makeRemoteUser(42, 'jdoe')] },
    ]);

    expect(user.program).toBeUndefined();
    expect(user.department).toBeUndefined();
    expect(fork.flush).not.toHaveBeenCalled();
  });

  it('does not flush when derived values match existing (equality guard)', async () => {
    const dept = makeDepartment('d1');
    const program = makeProgram('p1', 100, dept);
    const course = makeCourse(program);
    const user = makeUser({
      id: 'u1',
      moodleUserId: 42,
      program,
      department: dept,
    });

    const fork = buildFork([program], [user]);
    await setup(fork);

    await service['backfillUserScopes']([
      { course, remoteUsers: [makeRemoteUser(42, 'jdoe')] },
    ]);

    expect(fork.flush).not.toHaveBeenCalled();
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('0 derived'),
    );
  });

  it('counts users with no resolvable enrollments as null', async () => {
    const dept = makeDepartment('d1');
    const program = makeProgram('p1', 100, dept);
    const course = makeCourse(program);

    // User exists in DB but has no enrollments mapped via fetched snapshot
    // (none should exist — we pass an empty fetched list scenario)
    const user = makeUser({ id: 'u1', moodleUserId: 42 });

    // Only one enrollment, but the program lookup fails (not in programById)
    const fork: FakeFork = {
      find: jest.fn((entity: unknown) => {
        if (entity === Program) return Promise.resolve([]); // program not found
        if (entity === User) return Promise.resolve([user]);
        return Promise.resolve([]);
      }),
      populate: jest.fn(() => Promise.resolve(undefined)),
      flush: jest.fn(() => Promise.resolve(undefined)),
    };
    await setup(fork);

    await service['backfillUserScopes']([
      { course, remoteUsers: [makeRemoteUser(42, 'jdoe')] },
    ]);

    expect(fork.flush).not.toHaveBeenCalled();
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('1 no enrollments'),
    );
  });

  it('does not overwrite user.campus when already set', async () => {
    const dept = makeDepartment('d1');
    const program = makeProgram('p1', 100, dept);
    const course = makeCourse(program);
    const initialCampus = makeCampus('campus-1', 'OTHER');
    const otherCampus = makeCampus('campus-2', 'UCMN');
    const user = makeUser({
      id: 'u1',
      moodleUserId: 42,
      userName: 'ucmn-262141935',
      campus: initialCampus,
    } as Partial<User>);

    // Even though the username prefix would resolve to UCMN, fill-if-null
    // means the existing campus is preserved.
    const fork = buildFork([program], [user], [otherCampus]);
    await setup(fork);

    await service['backfillUserScopes']([
      { course, remoteUsers: [makeRemoteUser(42, 'ucmn-262141935')] },
    ]);

    expect(user.campus).toBe(initialCampus);
  });

  it('assigns campus from username prefix when campus is null', async () => {
    const dept = makeDepartment('d1');
    const program = makeProgram('p1', 100, dept);
    const course = makeCourse(program);
    const ucmnCampus = makeCampus('campus-1', 'UCMN');
    const user = makeUser({
      id: 'u1',
      moodleUserId: 42,
      userName: 'ucmn-262141935',
    });

    const fork = buildFork([program], [user], [ucmnCampus]);
    await setup(fork);

    await service['backfillUserScopes']([
      { course, remoteUsers: [makeRemoteUser(42, 'ucmn-262141935')] },
    ]);

    expect(user.campus).toBe(ucmnCampus);
    expect(fork.flush).toHaveBeenCalledTimes(1);
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('1 campus assigned'),
    );
  });

  it('skips campus lookup for usernames without a dash prefix', async () => {
    const dept = makeDepartment('d1');
    const program = makeProgram('p1', 100, dept);
    const course = makeCourse(program);
    const user = makeUser({
      id: 'u1',
      moodleUserId: 42,
      userName: 'jdoe',
    });

    const fork = buildFork([program], [user], []);
    await setup(fork);

    await service['backfillUserScopes']([
      { course, remoteUsers: [makeRemoteUser(42, 'jdoe')] },
    ]);

    expect(user.campus).toBeUndefined();
    // fork.find should be called for Program + User only, not Campus
    const findCalls = (fork.find.mock.calls as unknown[][]).map(
      (call) => call[0],
    );
    expect(findCalls).not.toContain(Campus);
  });

  it('leaves campus null when username prefix matches no Campus row', async () => {
    const dept = makeDepartment('d1');
    const program = makeProgram('p1', 100, dept);
    const course = makeCourse(program);
    const user = makeUser({
      id: 'u1',
      moodleUserId: 42,
      userName: 'unknown-262141935',
    });

    const fork = buildFork([program], [user], []);
    await setup(fork);

    await service['backfillUserScopes']([
      { course, remoteUsers: [makeRemoteUser(42, 'unknown-262141935')] },
    ]);

    expect(user.campus).toBeUndefined();
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining('0 campus assigned'),
    );
  });
});
