import { Test, TestingModule } from '@nestjs/testing';
import { EnrollmentsService } from './enrollments.service';
import { EntityManager } from '@mikro-orm/core';
import { User } from 'src/entities/user.entity';
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
    (em.find as jest.Mock).mockResolvedValue(mockFacultyEnrollments);

    const result = await service.getMyEnrollments(1, 10);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('e1');
    expect(result.data[0].faculty).toEqual({
      id: 'faculty-1',
      fullName: 'Dr. Smith',
      employeeNumber: 'EMP001',
      profilePicture: 'https://example.com/pic.jpg',
    });
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
        },
      },
    ];

    (em.findAndCount as jest.Mock).mockResolvedValue([mockEnrollments, 1]);
    (em.find as jest.Mock).mockResolvedValue([]);

    const result = await service.getMyEnrollments(1, 10);

    expect(result.data[0].faculty).toBeNull();
  });

  it('should not query faculty when no enrollments exist', async () => {
    (em.findAndCount as jest.Mock).mockResolvedValue([[], 0]);

    const result = await service.getMyEnrollments(1, 10);

    expect(result.data).toHaveLength(0);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(em.find).not.toHaveBeenCalled();
  });
});
