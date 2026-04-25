import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { QueryOrder } from '@mikro-orm/core';
import { FacultyService } from './faculty.service';
import { CurrentUserService } from 'src/modules/common/cls/current-user.service';
import { ScopeResolverService } from 'src/modules/common/services/scope-resolver.service';
import { User } from 'src/entities/user.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { UserRole } from 'src/modules/auth/roles.enum';
import { EnrollmentRole } from 'src/modules/questionnaires/lib/questionnaire.types';
import { GetFacultyEnrollmentsQueryDto } from '../dto/requests/get-faculty-enrollments-query.dto';
import { ListFacultyQueryDto } from '../dto/requests/list-faculty-query.dto';

describe('FacultyService', () => {
  let service: FacultyService;
  let em: {
    findOne: jest.Mock;
    find: jest.Mock;
    findAndCount: jest.Mock;
    count: jest.Mock;
    getConnection: jest.Mock;
  };
  let scopeResolver: {
    ResolveDepartmentIds: jest.Mock;
    IsFacultyInSemesterScope: jest.Mock;
  };
  let currentUserService: { getOrFail: jest.Mock };
  let executeMock: jest.Mock;

  const semesterId = 'semester-1';
  const deptId = 'dept-1';
  const deptId2 = 'dept-2';
  const programId = 'program-1';

  const baseQuery: ListFacultyQueryDto = {
    semesterId,
    page: 1,
    limit: 20,
  };

  const baseEnrollmentsQuery: GetFacultyEnrollmentsQueryDto = {
    semesterId,
    page: 1,
    limit: 10,
  };

  const mockUser = (
    id: string,
    fullName: string | undefined,
    firstName: string,
    lastName: string,
    profilePicture: string,
  ) =>
    ({
      id,
      fullName,
      firstName,
      lastName,
      userProfilePicture: profilePicture,
    }) as unknown as User;

  const mockEnrollment = (userId: string, courseShortname: string) => ({
    user: { id: userId },
    course: { shortname: courseShortname },
  });

  beforeEach(async () => {
    executeMock = jest.fn();

    em = {
      findOne: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      count: jest.fn(),
      getConnection: jest.fn().mockReturnValue({ execute: executeMock }),
    };

    scopeResolver = {
      ResolveDepartmentIds: jest.fn(),
      IsFacultyInSemesterScope: jest.fn().mockResolvedValue(true),
    };

    currentUserService = {
      getOrFail: jest.fn().mockReturnValue({
        id: 'dean-user',
        roles: [UserRole.DEAN],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FacultyService,
        { provide: EntityManager, useValue: em },
        { provide: ScopeResolverService, useValue: scopeResolver },
        { provide: CurrentUserService, useValue: currentUserService },
      ],
    }).compile();

    service = module.get(FacultyService);
  });

  function setupSemesterFound() {
    em.findOne.mockResolvedValue({ id: semesterId });
  }

  /**
   * Prime the raw-SQL listing path: count query, paginated user-id query,
   * then the user + enrollment hydration (`em.find` calls).
   *
   * Enrollment-driven listing means a "no rows" outcome can short-circuit
   * before the user-id query — call `primeListingEmpty()` for that branch.
   */
  function primeListingEmpty() {
    executeMock.mockResolvedValueOnce([{ count: '0' }]);
  }

  function primeListing(
    userIds: string[],
    totalCount: number,
    users: User[],
    enrollments: ReturnType<typeof mockEnrollment>[],
  ) {
    executeMock
      .mockResolvedValueOnce([{ count: String(totalCount) }])
      .mockResolvedValueOnce(userIds.map((id) => ({ user_id: id })));
    em.find.mockResolvedValueOnce(users).mockResolvedValueOnce(enrollments);
  }

  describe('ListFaculty', () => {
    it('returns enrollment-driven faculty list with subjects[] for super admin (null scope)', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);

      const user1 = mockUser('u1', 'Alice', 'Alice', 'Smith', 'pic1.jpg');
      const user2 = mockUser('u2', 'Bob', 'Bob', 'Jones', 'pic2.jpg');
      primeListing(
        ['u1', 'u2'],
        2,
        [user1, user2],
        [mockEnrollment('u1', 'CS101'), mockEnrollment('u2', 'CS201')],
      );

      const result = await service.ListFaculty(baseQuery);

      expect(result.data).toHaveLength(2);
      expect(result.meta.totalItems).toBe(2);
      expect(scopeResolver.ResolveDepartmentIds).toHaveBeenCalledWith(
        semesterId,
      );

      // Generated SQL is enrollment-join based and includes the per-semester
      // department predicate. The cross-dept-only predicates must NOT appear
      // (this endpoint includes both home-dept and cross-dept teachers).
      const [countSql] = executeMock.mock.calls[0] as [string, unknown[]];
      const normalized = countSql.replace(/\s+/g, ' ');
      expect(normalized).toContain('FROM enrollment e');
      expect(normalized).toContain('d.semester_id = ?');
      expect(normalized).not.toContain('u.department_id <> d.id');
    });

    it('includes carryover faculty (home dept in another semester) — the FAC bug fix', async () => {
      // Faculty user has user.department pointing to a previous semester's
      // Department row, but they have a TEACHER enrollment in the requested
      // semester's courses. Old (home-dept-driven) listing excluded them; the
      // new enrollment-driven listing must include them.
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      const carryoverFaculty = mockUser(
        'u-carryover',
        'Carryover Faculty',
        'Carryover',
        'Faculty',
        '',
      );
      primeListing(
        ['u-carryover'],
        1,
        [carryoverFaculty],
        [mockEnrollment('u-carryover', 'CS101')],
      );

      const result = await service.ListFaculty(baseQuery);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].subjects).toEqual(['CS101']);

      // Sanity: the count query passed semesterId + scoped deptIds as params.
      const [, countParams] = executeMock.mock.calls[0] as [string, unknown[]];
      expect(countParams[0]).toBe(semesterId);
      expect(countParams).toContain(deptId);
    });

    it('short-circuits when scope resolves to [] (dean with no scope)', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([]);

      const result = await service.ListFaculty(baseQuery);

      expect(result.data).toEqual([]);
      expect(result.meta).toEqual({
        totalItems: 0,
        itemCount: 0,
        itemsPerPage: 20,
        totalPages: 0,
        currentPage: 1,
      });
      expect(executeMock).not.toHaveBeenCalled();
      expect(em.find).not.toHaveBeenCalled();
    });

    it('returns zero meta and skips enrichment on empty result', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);
      primeListingEmpty();

      const result = await service.ListFaculty(baseQuery);

      expect(result.data).toEqual([]);
      expect(result.meta.totalItems).toBe(0);
      expect(em.find).not.toHaveBeenCalled();
    });

    it('paginates: passes limit + offset as the last two SQL params', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      const user1 = mockUser('u1', 'Alice', 'Alice', 'Smith', '');
      primeListing(['u1'], 25, [user1], []);

      await service.ListFaculty({ ...baseQuery, page: 2, limit: 10 });

      const paginatedCall = executeMock.mock.calls[1] as [string, unknown[]];
      expect(paginatedCall[1].slice(-2)).toEqual([10, 10]);
    });

    it('escapes LIKE wildcards in search and threads to the SQL params', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      primeListingEmpty();

      await service.ListFaculty({ ...baseQuery, search: '%admin_test' });

      const [, params] = executeMock.mock.calls[0] as [string, unknown[]];
      expect(params).toContain('%\\%admin\\_test%');
    });

    it('subjects[] dedupes and sorts alphabetically', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      const user = mockUser('u1', 'Alice', 'Alice', 'Smith', '');
      primeListing(
        ['u1'],
        1,
        [user],
        [
          mockEnrollment('u1', 'BETA'),
          mockEnrollment('u1', 'ALPHA'),
          mockEnrollment('u1', 'BETA'), // duplicate
        ],
      );

      const result = await service.ListFaculty(baseQuery);

      expect(result.data[0].subjects).toEqual(['ALPHA', 'BETA']);
    });

    it('throws ForbiddenException when departmentId is outside dean scope', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      await expect(
        service.ListFaculty({ ...baseQuery, departmentId: deptId2 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when programId does not belong to specified departmentId', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      em.findOne.mockReset();
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce({ id: programId, department: { id: deptId2 } });

      await expect(
        service.ListFaculty({
          ...baseQuery,
          departmentId: deptId,
          programId,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when programId belongs to a department outside dean scope', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);
      em.findOne.mockReset();
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce({ id: programId, department: { id: deptId2 } });

      await expect(
        service.ListFaculty({ ...baseQuery, programId }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when programId does not exist', async () => {
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce(null);

      await expect(
        service.ListFaculty({ ...baseQuery, programId: 'missing' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when semester does not exist', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(service.ListFaculty(baseQuery)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('uses firstName + lastName when fullName is null', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      const user = mockUser('u1', undefined, 'Ada', 'Lovelace', '');
      primeListing(['u1'], 1, [user], []);

      const result = await service.ListFaculty(baseQuery);

      expect(result.data[0].fullName).toBe('Ada Lovelace');
    });

    it('subjects enrichment query is scoped to the requested semester + dept scope', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);
      const user = mockUser('u1', 'Alice', 'Alice', 'Smith', '');
      primeListing(['u1'], 1, [user], [mockEnrollment('u1', 'CS101')]);

      await service.ListFaculty(baseQuery);

      // Second em.find call is the subjects-enrichment query.
      const findCall = em.find.mock.calls[1] as unknown[];
      const filter = findCall[1] as Record<string, unknown>;
      expect(filter).toMatchObject({
        user: { $in: ['u1'] },
        role: {
          $in: [EnrollmentRole.EDITING_TEACHER, EnrollmentRole.TEACHER],
        },
        isActive: true,
        course: {
          isActive: true,
          program: {
            department: {
              semester: semesterId,
              id: { $in: [deptId] },
            },
          },
        },
      });
    });
  });

  // ---------------------------------------------------------------------------
  // ListCrossDepartmentTeaching (secondary endpoint) — ACs 13, 14, 15, 23.
  // ---------------------------------------------------------------------------

  describe('ListCrossDepartmentTeaching', () => {
    function primeCrossDeptEmpty() {
      executeMock.mockResolvedValueOnce([{ count: '0' }]);
    }

    function primeCrossDept(
      userIds: string[],
      totalCount: number,
      users: User[],
      enrollments: ReturnType<typeof mockEnrollment>[],
    ) {
      executeMock
        .mockResolvedValueOnce([{ count: String(totalCount) }])
        .mockResolvedValueOnce(userIds.map((id) => ({ user_id: id })));
      em.find.mockResolvedValueOnce(users).mockResolvedValueOnce(enrollments);
    }

    it('generated SQL restricts to true cross-dept (AC 13) and excludes NULL/soft-deleted home (ACs 14, 23)', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);
      primeCrossDeptEmpty();

      await service.ListCrossDepartmentTeaching(baseQuery);

      const [countSql] = executeMock.mock.calls[0] as [string, unknown[]];
      // Normalize whitespace to make conjunction assertions robust to
      // formatting changes in the SQL builder.
      const normalized = countSql.replace(/\s+/g, ' ');

      // The three cross-dept predicates must be combined via AND so each
      // individually narrows the result set (not OR'd, which would widen).
      expect(normalized).toMatch(
        /u\.department_id IS NOT NULL AND u\.department_id <> d\.id AND EXISTS \(SELECT 1 FROM department hd WHERE hd\.id = u\.department_id AND hd\.deleted_at IS NULL\)/,
      );
    });

    it('returns empty list when scope resolves to [] (short-circuit)', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([]);

      const result = await service.ListCrossDepartmentTeaching(baseQuery);

      expect(result.data).toEqual([]);
      expect(result.meta.totalItems).toBe(0);
      expect(executeMock).not.toHaveBeenCalled();
      expect(em.find).not.toHaveBeenCalled();
    });

    it('paginates + enriches subjects from scope-visible enrollments (AC 15)', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      const user1 = mockUser('u1', 'Alice', 'Alice', 'Smith', '');
      primeCrossDept(
        ['u1'],
        1,
        [user1],
        [mockEnrollment('u1', 'BETA'), mockEnrollment('u1', 'ALPHA')],
      );

      const result = await service.ListCrossDepartmentTeaching({
        ...baseQuery,
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].subjects).toEqual(['ALPHA', 'BETA']);
      expect(result.meta).toEqual({
        totalItems: 1,
        itemCount: 1,
        itemsPerPage: 10,
        totalPages: 1,
        currentPage: 1,
      });

      // The second execute() call receives limit + offset appended.
      const paginatedCall = executeMock.mock.calls[1] as [string, unknown[]];
      expect(paginatedCall[1].slice(-2)).toEqual([10, 0]);
    });

    it('throws ForbiddenException when departmentId outside dean scope', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);

      await expect(
        service.ListCrossDepartmentTeaching({
          ...baseQuery,
          departmentId: deptId2,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when semester missing', async () => {
      em.findOne.mockResolvedValue(null);

      await expect(
        service.ListCrossDepartmentTeaching(baseQuery),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when programId does not exist (parity with primary)', async () => {
      scopeResolver.ResolveDepartmentIds.mockResolvedValue(null);
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce(null);

      await expect(
        service.ListCrossDepartmentTeaching({
          ...baseQuery,
          programId: 'missing-program',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('propagates LIKE wildcard escaping to the raw SQL params (AC 15 parity)', async () => {
      setupSemesterFound();
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);
      primeCrossDeptEmpty();

      await service.ListCrossDepartmentTeaching({
        ...baseQuery,
        search: '%admin_test',
      });

      const [, params] = executeMock.mock.calls[0] as [string, unknown[]];
      expect(params).toContain('%\\%admin\\_test%');
    });
  });

  describe('GetSubmissionCount', () => {
    const facultyId = 'faculty-1';

    it('returns count 0 when user and semester exist but no submissions', async () => {
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce({ id: facultyId });
      em.count.mockResolvedValue(0);

      const result = await service.GetSubmissionCount(facultyId, semesterId);

      expect(result).toEqual({ count: 0 });
    });

    it('returns correct count when submissions exist', async () => {
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce({ id: facultyId });
      em.count.mockResolvedValue(5);

      const result = await service.GetSubmissionCount(facultyId, semesterId);

      expect(result).toEqual({ count: 5 });
    });

    it('throws NotFoundException when semester does not exist', async () => {
      em.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: facultyId });

      await expect(
        service.GetSubmissionCount(facultyId, semesterId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when user does not exist', async () => {
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce(null);

      await expect(
        service.GetSubmissionCount(facultyId, semesterId),
      ).rejects.toThrow(NotFoundException);
    });

    it('calls em.count with correct filter shape', async () => {
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce({ id: facultyId });
      em.count.mockResolvedValue(3);

      await service.GetSubmissionCount(facultyId, semesterId);

      expect(em.count).toHaveBeenCalledWith(expect.any(Function), {
        faculty: facultyId,
        semester: semesterId,
      });
    });
  });

  describe('GetFacultyEnrollments', () => {
    const facultyId = 'faculty-1';

    beforeEach(() => {
      currentUserService.getOrFail.mockReturnValue({
        id: 'dean-user',
        roles: [UserRole.DEAN],
      });
    });

    it('returns paginated teaching enrollments for an in-scope faculty', async () => {
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce({
          id: facultyId,
          isActive: true,
          roles: [UserRole.FACULTY],
          department: { id: deptId },
          fullName: 'Prof. Ada Lovelace',
          firstName: 'Ada',
          lastName: 'Lovelace',
          userName: 'EMP001',
          userProfilePicture: 'https://example.com/ada.jpg',
        });
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);
      em.findAndCount.mockResolvedValueOnce([
        [
          {
            id: 'enrollment-1',
            role: EnrollmentRole.EDITING_TEACHER,
            course: {
              id: 'course-1',
              moodleCourseId: 101,
              shortname: 'CS101',
              fullname: 'Intro to CS',
              courseImage: null,
              program: {
                department: {
                  semester: {
                    id: semesterId,
                    code: 'S12526',
                    label: '1st Semester',
                    academicYear: '2025-2026',
                  },
                },
              },
            },
            section: { id: 'section-1', name: 'A' },
          },
        ],
        1,
      ]);

      const result = await service.GetFacultyEnrollments(
        facultyId,
        baseEnrollmentsQuery,
      );

      expect(result.meta).toEqual({
        totalItems: 1,
        itemCount: 1,
        itemsPerPage: 10,
        totalPages: 1,
        currentPage: 1,
      });
      expect(result.data[0]).toEqual({
        id: 'enrollment-1',
        role: EnrollmentRole.EDITING_TEACHER,
        course: {
          id: 'course-1',
          moodleCourseId: 101,
          shortname: 'CS101',
          fullname: 'Intro to CS',
          courseImage: undefined,
        },
        faculty: {
          id: facultyId,
          fullName: 'Prof. Ada Lovelace',
          employeeNumber: 'EMP001',
          profilePicture: 'https://example.com/ada.jpg',
        },
        semester: {
          id: semesterId,
          code: 'S12526',
          label: '1st Semester',
          academicYear: '2025-2026',
        },
        section: { id: 'section-1', name: 'A' },
        submission: { submitted: false },
      });

      expect(em.findAndCount).toHaveBeenCalledWith(
        Enrollment,
        {
          user: facultyId,
          role: {
            $in: [EnrollmentRole.EDITING_TEACHER, EnrollmentRole.TEACHER],
          },
          isActive: true,
          course: {
            isActive: true,
            program: { department: { semester: semesterId } },
          },
        },
        expect.objectContaining({
          populate: ['course.program.department.semester', 'section'],
          limit: 10,
          offset: 0,
          orderBy: { timeModified: QueryOrder.DESC },
        }),
      );
    });

    it('allows faculty to fetch their own enrollments', async () => {
      currentUserService.getOrFail.mockReturnValue({
        id: facultyId,
        roles: [UserRole.FACULTY],
      });
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce({
          id: facultyId,
          isActive: true,
          roles: [UserRole.FACULTY],
          department: { id: deptId },
          firstName: 'Ada',
          lastName: 'Lovelace',
          userName: 'EMP001',
          userProfilePicture: '',
        });
      em.findAndCount.mockResolvedValueOnce([[], 0]);

      const result = await service.GetFacultyEnrollments(
        facultyId,
        baseEnrollmentsQuery,
      );

      expect(result.data).toEqual([]);
      expect(scopeResolver.ResolveDepartmentIds).not.toHaveBeenCalled();
    });

    it('forbids faculty from fetching another faculty member', async () => {
      currentUserService.getOrFail.mockReturnValue({
        id: 'other-faculty',
        roles: [UserRole.FACULTY],
      });
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce({
          id: facultyId,
          isActive: true,
          roles: [UserRole.FACULTY],
          department: { id: deptId },
        });

      await expect(
        service.GetFacultyEnrollments(facultyId, baseEnrollmentsQuery),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids dean when faculty has no in-scope enrollments for the semester', async () => {
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce({
          id: facultyId,
          isActive: true,
          roles: [UserRole.FACULTY],
          department: { id: deptId2 },
        });
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);
      scopeResolver.IsFacultyInSemesterScope.mockResolvedValueOnce(false);

      await expect(
        service.GetFacultyEnrollments(facultyId, baseEnrollmentsQuery),
      ).rejects.toThrow(ForbiddenException);
      expect(scopeResolver.IsFacultyInSemesterScope).toHaveBeenCalledWith(
        facultyId,
        semesterId,
        [deptId],
      );
    });

    it('allows dean to access carryover faculty (home dept in different semester) when enrollments exist in scope', async () => {
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce({
          id: facultyId,
          isActive: true,
          roles: [UserRole.FACULTY],
          // home dept is a different semester's dept (carryover scenario)
          department: { id: deptId2 },
          firstName: 'Ada',
          lastName: 'Lovelace',
          userName: 'EMP001',
          userProfilePicture: '',
        });
      scopeResolver.ResolveDepartmentIds.mockResolvedValue([deptId]);
      // IsFacultyInSemesterScope sees the enrollment join → true.
      em.findAndCount.mockResolvedValueOnce([[], 0]);

      const result = await service.GetFacultyEnrollments(
        facultyId,
        baseEnrollmentsQuery,
      );

      expect(result.data).toEqual([]);
      expect(scopeResolver.IsFacultyInSemesterScope).toHaveBeenCalledWith(
        facultyId,
        semesterId,
        [deptId],
      );
    });

    it('throws NotFoundException when semester does not exist', async () => {
      em.findOne.mockResolvedValueOnce(null);

      await expect(
        service.GetFacultyEnrollments(facultyId, baseEnrollmentsQuery),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when faculty does not exist', async () => {
      em.findOne
        .mockResolvedValueOnce({ id: semesterId })
        .mockResolvedValueOnce(null);

      await expect(
        service.GetFacultyEnrollments(facultyId, baseEnrollmentsQuery),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
