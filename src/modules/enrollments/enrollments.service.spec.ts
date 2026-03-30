import { Test, TestingModule } from '@nestjs/testing';
import { EnrollmentsService } from './enrollments.service';
import { EntityManager } from '@mikro-orm/core';
import { User } from 'src/entities/user.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { QuestionnaireSubmission } from 'src/entities/questionnaire-submission.entity';
import { CacheService } from '../common/cache/cache.service';
import { CurrentUserService } from '../common/cls/current-user.service';

describe('EnrollmentsService', () => {
  let service: EnrollmentsService;
  let em: EntityManager;
  let currentUserService: { getOrFail: jest.Mock };

  const mockUser = { id: 'user-id' } as User;

  beforeEach(async () => {
    currentUserService = {
      getOrFail: jest.fn().mockReturnValue(mockUser),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentsService,
        {
          provide: EntityManager,
          useValue: {
            findAndCount: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: CacheService,
          useValue: {
            wrap: jest
              .fn()
              .mockImplementation(
                (_ns: string, _key: string, fn: () => Promise<unknown>) => fn(),
              ),
            invalidateNamespace: jest.fn(),
            invalidateNamespaces: jest.fn(),
          },
        },
        {
          provide: CurrentUserService,
          useValue: currentUserService,
        },
      ],
    }).compile();

    service = module.get<EnrollmentsService>(EnrollmentsService);
    em = module.get<EntityManager>(EntityManager);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return paginated enrollments with faculty data', async () => {
    const mockEnrollments = [
      {
        id: 'e1',
        role: 'student',
        course: {
          id: 'c1',
          moodleCourseId: 101,
          shortname: 'CS101',
          fullname: 'Intro to CS',
          courseImage: 'https://example.com/course.jpg',
          program: {
            department: {
              semester: {
                id: 'sem-1',
                code: 'S12526',
                label: '1st Semester',
                academicYear: '2025-2026',
              },
            },
          },
        },
      },
    ];

    const mockFacultyEnrollments = [
      {
        course: { id: 'c1' },
        user: {
          id: 'faculty-1',
          fullName: 'Dr. Smith',
          userName: 'EMP001',
          userProfilePicture: 'https://example.com/pic.jpg',
        },
      },
    ];

    (em.findAndCount as jest.Mock).mockResolvedValue([mockEnrollments, 1]);
    (em.find as jest.Mock).mockImplementation((entity: unknown) => {
      if (entity === Enrollment) return Promise.resolve(mockFacultyEnrollments);
      if (entity === QuestionnaireSubmission) return Promise.resolve([]);
      return Promise.resolve([]);
    });

    const result = await service.getMyEnrollments({ page: 1, limit: 10 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('e1');
    expect(result.data[0].faculty).toEqual({
      id: 'faculty-1',
      fullName: 'Dr. Smith',
      employeeNumber: 'EMP001',
      profilePicture: 'https://example.com/pic.jpg',
    });
    expect(result.data[0].semester).toEqual({
      id: 'sem-1',
      code: 'S12526',
      label: '1st Semester',
      academicYear: '2025-2026',
    });
    expect(result.data[0].submission).toEqual({ submitted: false });
    expect(result.meta.totalItems).toBe(1);
    expect(result.meta.totalPages).toBe(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(em.findAndCount).toHaveBeenCalledWith(
      expect.anything(),
      { user: 'user-id', isActive: true },
      expect.objectContaining({
        limit: 10,
        offset: 0,
      }),
    );
  });

  it('should return submission status when submissions exist', async () => {
    const submittedAt = new Date('2026-03-20T10:00:00Z');
    const mockEnrollments = [
      {
        id: 'e1',
        role: 'student',
        course: {
          id: 'c1',
          moodleCourseId: 101,
          shortname: 'CS101',
          fullname: 'Intro to CS',
          courseImage: null,
          program: {
            department: {
              semester: {
                id: 'sem-1',
                code: 'S12526',
                label: '1st Semester',
                academicYear: '2025-2026',
              },
            },
          },
        },
      },
    ];

    const mockSubmissions = [{ course: { id: 'c1' }, submittedAt }];

    (em.findAndCount as jest.Mock).mockResolvedValue([mockEnrollments, 1]);
    (em.find as jest.Mock).mockImplementation((entity: unknown) => {
      if (entity === Enrollment) return Promise.resolve([]);
      if (entity === QuestionnaireSubmission)
        return Promise.resolve(mockSubmissions);
      return Promise.resolve([]);
    });

    const result = await service.getMyEnrollments({ page: 1, limit: 10 });

    expect(result.data[0].submission).toEqual({
      submitted: true,
      submittedAt,
    });
  });

  it('should return null faculty when no faculty enrolled in course', async () => {
    const mockEnrollments = [
      {
        id: 'e1',
        role: 'student',
        course: {
          id: 'c1',
          moodleCourseId: 101,
          shortname: 'CS101',
          fullname: 'Intro to CS',
          courseImage: null,
          program: {
            department: {
              semester: {
                id: 'sem-1',
                code: 'S12526',
                label: '1st Semester',
                academicYear: '2025-2026',
              },
            },
          },
        },
      },
    ];

    (em.findAndCount as jest.Mock).mockResolvedValue([mockEnrollments, 1]);
    (em.find as jest.Mock).mockResolvedValue([]);

    const result = await service.getMyEnrollments({ page: 1, limit: 10 });

    expect(result.data[0].faculty).toBeNull();
  });

  it('should return null semester when hierarchy is incomplete', async () => {
    const mockEnrollments = [
      {
        id: 'e1',
        role: 'student',
        course: {
          id: 'c1',
          moodleCourseId: 101,
          shortname: 'CS101',
          fullname: 'Intro to CS',
          courseImage: null,
          program: undefined,
        },
      },
    ];

    (em.findAndCount as jest.Mock).mockResolvedValue([mockEnrollments, 1]);
    (em.find as jest.Mock).mockResolvedValue([]);

    const result = await service.getMyEnrollments({ page: 1, limit: 10 });

    expect(result.data[0].semester).toBeNull();
  });

  it('should return faculty data for teacher role (not just editingteacher)', async () => {
    const mockEnrollments = [
      {
        id: 'e1',
        role: 'student',
        course: {
          id: 'c1',
          moodleCourseId: 101,
          shortname: 'CS101',
          fullname: 'Intro to CS',
          courseImage: null,
          program: {
            department: {
              semester: {
                id: 'sem-1',
                code: 'S12526',
                label: '1st Semester',
                academicYear: '2025-2026',
              },
            },
          },
        },
      },
    ];

    const mockFacultyEnrollments = [
      {
        course: { id: 'c1' },
        user: {
          id: 'faculty-2',
          fullName: 'Prof. Jones',
          userName: 'EMP002',
          userProfilePicture: null,
        },
      },
    ];

    (em.findAndCount as jest.Mock).mockResolvedValue([mockEnrollments, 1]);
    (em.find as jest.Mock)
      .mockResolvedValueOnce(mockFacultyEnrollments)
      .mockResolvedValueOnce([]);

    const result = await service.getMyEnrollments({ page: 1, limit: 10 });

    expect(result.data[0].faculty).toEqual({
      id: 'faculty-2',
      fullName: 'Prof. Jones',
      employeeNumber: 'EMP002',
      profilePicture: undefined,
    });
  });

  it('should not query faculty or submissions when no enrollments exist', async () => {
    (em.findAndCount as jest.Mock).mockResolvedValue([[], 0]);

    const result = await service.getMyEnrollments({ page: 1, limit: 10 });

    expect(result.data).toHaveLength(0);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(em.find).not.toHaveBeenCalled();
  });
});
