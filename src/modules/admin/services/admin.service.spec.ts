import { EntityManager } from '@mikro-orm/postgresql';
import { Test, TestingModule } from '@nestjs/testing';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/modules/auth/roles.enum';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;
  let em: {
    findAndCount: jest.Mock;
  };

  beforeEach(async () => {
    em = {
      findAndCount: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        {
          provide: EntityManager,
          useValue: em,
        },
      ],
    }).compile();

    service = module.get(AdminService);
  });

  it('should return paginated users mapped for admin console display', async () => {
    const user = {
      id: 'user-1',
      userName: 'jdoe',
      fullName: 'John Doe',
      moodleUserId: 123,
      roles: [UserRole.FACULTY],
      isActive: true,
      campus: { id: 'campus-1', code: 'UCMN', name: 'Main' },
      department: { id: 'dept-1', code: 'CCS', name: 'Computer Studies' },
      program: { id: 'prog-1', code: 'BSCS', name: 'Computer Science' },
    } as User;

    em.findAndCount.mockResolvedValue([[user], 1]);

    const result = await service.ListUsers({ page: 1, limit: 20 });

    expect(result.data).toEqual([
      {
        id: 'user-1',
        userName: 'jdoe',
        fullName: 'John Doe',
        moodleUserId: 123,
        roles: [UserRole.FACULTY],
        isActive: true,
        campus: { id: 'campus-1', code: 'UCMN', name: 'Main' },
        department: {
          id: 'dept-1',
          code: 'CCS',
          name: 'Computer Studies',
        },
        program: {
          id: 'prog-1',
          code: 'BSCS',
          name: 'Computer Science',
        },
      },
    ]);
    expect(result.meta).toEqual({
      totalItems: 1,
      itemCount: 1,
      itemsPerPage: 20,
      totalPages: 1,
      currentPage: 1,
    });
  });

  it('should build a search filter across id and name fields', async () => {
    em.findAndCount.mockResolvedValue([[], 0]);

    await service.ListUsers({ search: 'john', page: 1, limit: 20 });

    expect(em.findAndCount).toHaveBeenCalledWith(
      User,
      expect.objectContaining({
        $or: [
          { id: { $ilike: '%john%' } },
          { userName: { $ilike: '%john%' } },
          { fullName: { $ilike: '%john%' } },
          { firstName: { $ilike: '%john%' } },
          { lastName: { $ilike: '%john%' } },
        ],
      }),
      expect.any(Object),
    );
  });

  it('should apply role, active state, and relation filters', async () => {
    em.findAndCount.mockResolvedValue([[], 0]);

    await service.ListUsers({
      role: UserRole.SUPER_ADMIN,
      isActive: false,
      campusId: 'campus-1',
      departmentId: 'dept-1',
      programId: 'prog-1',
      page: 1,
      limit: 20,
    });

    expect(em.findAndCount).toHaveBeenCalledWith(
      User,
      {
        roles: { $contains: [UserRole.SUPER_ADMIN] },
        isActive: false,
        campus: 'campus-1',
        department: 'dept-1',
        program: 'prog-1',
      },
      expect.any(Object),
    );
  });

  it('should return null relation payloads when relation data is absent', async () => {
    const user = {
      id: 'user-2',
      userName: 'asmith',
      firstName: 'Anna',
      lastName: 'Smith',
      fullName: null,
      roles: [UserRole.STUDENT],
      isActive: false,
      campus: null,
      department: null,
      program: null,
    } as unknown as User;

    em.findAndCount.mockResolvedValue([[user], 1]);

    const result = await service.ListUsers({ page: 1, limit: 20 });

    expect(result.data[0]).toEqual({
      id: 'user-2',
      userName: 'asmith',
      fullName: 'Anna Smith',
      moodleUserId: undefined,
      roles: [UserRole.STUDENT],
      isActive: false,
      campus: null,
      department: null,
      program: null,
    });
  });

  it('should use stable ordering and pagination options', async () => {
    em.findAndCount.mockResolvedValue([[], 0]);

    await service.ListUsers({ page: 3, limit: 15 });

    expect(em.findAndCount).toHaveBeenCalledWith(
      User,
      {},
      expect.objectContaining({
        limit: 15,
        offset: 30,
        orderBy: { userName: 'ASC', id: 'ASC' },
        populate: ['campus', 'department', 'program'],
      }),
    );
  });

  it('should return empty pagination metadata when there are no matches', async () => {
    em.findAndCount.mockResolvedValue([[], 0]);

    const result = await service.ListUsers({ page: 1, limit: 20 });

    expect(result).toEqual({
      data: [],
      meta: {
        totalItems: 0,
        itemCount: 0,
        itemsPerPage: 20,
        totalPages: 0,
        currentPage: 1,
      },
    });
  });
});
