import { Test, TestingModule } from '@nestjs/testing';
import { EnrollmentsService } from './enrollments.service';
import { EntityManager } from '@mikro-orm/core';
import { User } from 'src/entities/user.entity';

describe('EnrollmentsService', () => {
  let service: EnrollmentsService;
  let em: EntityManager;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentsService,
        {
          provide: EntityManager,
          useValue: {
            findAndCount: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EnrollmentsService>(EnrollmentsService);
    em = module.get<EntityManager>(EntityManager);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return paginated enrollments', async () => {
    const mockUser = { id: 'user-id' } as User;
    const mockEnrollments = [
      {
        id: 'e1',
        role: 'student',
        course: {
          id: 'c1',
          moodleCourseId: 101,
          shortname: 'CS101',
          fullname: 'Intro to CS',
        },
      },
    ];

    (em.findAndCount as jest.Mock).mockResolvedValue([mockEnrollments, 1]);

    const result = await service.getMyEnrollments(mockUser, 1, 10);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('e1');
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
});
