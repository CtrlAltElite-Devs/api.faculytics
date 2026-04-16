import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Test, TestingModule } from '@nestjs/testing';
import { Enrollment } from 'src/entities/enrollment.entity';
import { QuestionnaireSubmission } from 'src/entities/questionnaire-submission.entity';
import { Semester } from 'src/entities/semester.entity';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/modules/auth/roles.enum';
import {
  EnrollmentRole,
  RespondentRole,
} from 'src/modules/questionnaires/lib/questionnaire.types';
import { AdminNonSubmittersService } from './admin-non-submitters.service';

type EmMock = {
  findOne: jest.Mock;
  find: jest.Mock;
  findAndCount: jest.Mock;
};

function makeSemester(overrides: Partial<Semester> = {}): Semester {
  return {
    id: 'sem-1',
    code: 'S22526',
    label: 'Second Semester',
    academicYear: '2025-2026',
    ...overrides,
  } as Semester;
}

function makeEnrollment(userId: string, courseId = 'course-1'): Enrollment {
  return {
    user: { id: userId },
    course: { id: courseId },
    role: EnrollmentRole.STUDENT,
    isActive: true,
  } as unknown as Enrollment;
}

function makeStudent(
  id: string,
  userName: string,
  fullName: string,
): Partial<User> {
  return {
    id,
    userName,
    fullName,
    firstName: fullName.split(' ')[0],
    lastName: fullName.split(' ')[1] ?? '',
    roles: [UserRole.STUDENT],
    isActive: true,
    campus: null as unknown as User['campus'],
    department: null as unknown as User['department'],
    program: null as unknown as User['program'],
  };
}

describe('AdminNonSubmittersService', () => {
  let service: AdminNonSubmittersService;
  let em: EmMock;

  beforeEach(async () => {
    em = {
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminNonSubmittersService,
        { provide: EntityManager, useValue: em },
      ],
    }).compile();

    service = module.get(AdminNonSubmittersService);
  });

  it('returns students enrolled in the scope semester who have no submissions', async () => {
    const semester = makeSemester();
    em.findOne.mockResolvedValueOnce(semester);

    em.find.mockImplementation((entity: unknown) => {
      if (entity === Enrollment) {
        return Promise.resolve([
          makeEnrollment('u-1', 'c-1'),
          makeEnrollment('u-2', 'c-1'),
          makeEnrollment('u-2', 'c-2'),
          makeEnrollment('u-3', 'c-2'),
        ]);
      }
      if (entity === QuestionnaireSubmission) {
        return Promise.resolve([{ respondent: { id: 'u-1' } }]);
      }
      return Promise.resolve([]);
    });

    const studentU2 = makeStudent('u-2', 'alice', 'Alice Doe');
    const studentU3 = makeStudent('u-3', 'bob', 'Bob Smith');
    em.findAndCount.mockResolvedValue([[studentU2, studentU3], 2]);

    const result = await service.ListNonSubmitters({ page: 1, limit: 20 });

    expect(em.findOne).toHaveBeenCalledWith(
      Semester,
      {},
      { orderBy: { createdAt: 'DESC' } },
    );

    expect(em.find).toHaveBeenCalledWith(
      Enrollment,
      expect.objectContaining({
        role: EnrollmentRole.STUDENT,
        isActive: true,
      }),
      expect.objectContaining({ fields: ['user', 'course'] }),
    );

    expect(em.find).toHaveBeenCalledWith(
      QuestionnaireSubmission,
      expect.objectContaining({
        semester: semester.id,
        respondentRole: RespondentRole.STUDENT,
      }),
      expect.objectContaining({ fields: ['respondent'] }),
    );

    const findAndCountCalls = em.findAndCount.mock.calls as Array<
      [unknown, { id: { $in: string[] } }, unknown]
    >;
    const userFilterCall = findAndCountCalls[0][1];
    expect(new Set(userFilterCall.id.$in)).toEqual(new Set(['u-2', 'u-3']));

    expect(result.data).toHaveLength(2);
    const alice = result.data.find((d) => d.userName === 'alice');
    expect(alice?.enrolledCoursesInSemester).toBe(2);
    expect(result.scope).toEqual({
      semesterId: 'sem-1',
      semesterCode: 'S22526',
      semesterLabel: 'Second Semester',
      academicYear: '2025-2026',
    });
  });

  it('resolves facultyUsername and narrows submitters to the faculty+course tuple', async () => {
    em.findOne
      .mockResolvedValueOnce(makeSemester())
      .mockResolvedValueOnce({ id: 'faculty-1' });

    em.find.mockImplementation((entity: unknown) => {
      if (entity === Enrollment) {
        return Promise.resolve([
          makeEnrollment('u-1', 'c-1'),
          makeEnrollment('u-2', 'c-1'),
        ]);
      }
      if (entity === QuestionnaireSubmission) {
        return Promise.resolve([{ respondent: { id: 'u-2' } }]);
      }
      return Promise.resolve([]);
    });

    em.findAndCount.mockResolvedValue([
      [makeStudent('u-1', 'kevin', 'Kevin Lee')],
      1,
    ]);

    const result = await service.ListNonSubmitters({
      facultyUsername: 'prof.moore',
      courseId: 'c-1',
    });

    expect(em.findOne).toHaveBeenNthCalledWith(
      2,
      User,
      { userName: 'prof.moore' },
      { fields: ['id'] },
    );

    expect(em.find).toHaveBeenCalledWith(
      QuestionnaireSubmission,
      expect.objectContaining({
        semester: 'sem-1',
        faculty: 'faculty-1',
        course: 'c-1',
      }),
      expect.anything(),
    );

    expect(result.data).toHaveLength(1);
    expect(result.data[0].userName).toBe('kevin');
  });

  it('throws NotFoundException when facultyUsername does not resolve', async () => {
    em.findOne
      .mockResolvedValueOnce(makeSemester())
      .mockResolvedValueOnce(null);

    await expect(
      service.ListNonSubmitters({ facultyUsername: 'ghost.user' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws BadRequestException when an explicit semesterId does not exist', async () => {
    em.findOne.mockResolvedValueOnce(null);

    await expect(
      service.ListNonSubmitters({ semesterId: 'missing-sem' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns an empty response when no semester exists in the system', async () => {
    em.findOne.mockResolvedValueOnce(null);

    const result = await service.ListNonSubmitters({});

    expect(result.data).toEqual([]);
    expect(result.scope.semesterId).toBe('');
  });

  it('returns an empty response when every enrolled student has already submitted', async () => {
    em.findOne.mockResolvedValueOnce(makeSemester());
    em.find.mockImplementation((entity: unknown) => {
      if (entity === Enrollment) {
        return Promise.resolve([makeEnrollment('u-1'), makeEnrollment('u-2')]);
      }
      if (entity === QuestionnaireSubmission) {
        return Promise.resolve([
          { respondent: { id: 'u-1' } },
          { respondent: { id: 'u-2' } },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await service.ListNonSubmitters({});

    expect(em.findAndCount).not.toHaveBeenCalled();
    expect(result.data).toEqual([]);
    expect(result.meta.totalPages).toBe(0);
  });
});
