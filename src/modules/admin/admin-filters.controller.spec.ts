import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/security/guards/roles.guard';
import { UserRole } from 'src/modules/auth/roles.enum';
import { AdminFiltersController } from './admin-filters.controller';
import { AdminFiltersService } from './services/admin-filters.service';

describe('AdminFiltersController', () => {
  let controller: AdminFiltersController;
  let filtersService: {
    GetCampuses: jest.Mock;
    GetSemesters: jest.Mock;
    GetDepartments: jest.Mock;
    GetPrograms: jest.Mock;
    GetRoles: jest.Mock;
  };

  beforeEach(async () => {
    filtersService = {
      GetCampuses: jest.fn().mockResolvedValue([]),
      GetSemesters: jest.fn().mockResolvedValue([]),
      GetDepartments: jest.fn().mockResolvedValue([]),
      GetPrograms: jest.fn().mockResolvedValue([]),
      GetRoles: jest.fn().mockReturnValue(Object.values(UserRole)),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminFiltersController],
      providers: [
        {
          provide: AdminFiltersService,
          useValue: filtersService,
        },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AdminFiltersController);
  });

  it('should delegate campus listing to the filters service', async () => {
    const campuses = [
      { id: 'c-1', code: 'UCMN', name: 'Main' },
      { id: 'c-2', code: 'UCB', name: 'Baliwag' },
    ];
    filtersService.GetCampuses.mockResolvedValue(campuses);

    const result = await controller.GetCampuses();

    expect(filtersService.GetCampuses).toHaveBeenCalled();
    expect(result).toEqual(campuses);
  });

  it('should delegate department listing to the filters service', async () => {
    const departments = [{ id: 'd-1', code: 'CCS', name: 'Computer Studies' }];
    filtersService.GetDepartments.mockResolvedValue(departments);

    const result = await controller.GetDepartments({ campusId: 'c-1' });

    expect(filtersService.GetDepartments).toHaveBeenCalledWith(
      'c-1',
      undefined,
    );
    expect(result).toEqual(departments);
  });

  it('should pass undefined campusId when not provided', async () => {
    await controller.GetDepartments({});

    expect(filtersService.GetDepartments).toHaveBeenCalledWith(
      undefined,
      undefined,
    );
  });

  it('should pass semesterId to the filters service', async () => {
    await controller.GetDepartments({ semesterId: 's-1' });

    expect(filtersService.GetDepartments).toHaveBeenCalledWith(
      undefined,
      's-1',
    );
  });

  it('should delegate program listing to the filters service', async () => {
    const programs = [{ id: 'p-1', code: 'BSCS', name: 'Computer Science' }];
    filtersService.GetPrograms.mockResolvedValue(programs);

    const result = await controller.GetPrograms({ departmentId: 'd-1' });

    expect(filtersService.GetPrograms).toHaveBeenCalledWith('d-1');
    expect(result).toEqual(programs);
  });

  it('should pass undefined departmentId when not provided', async () => {
    await controller.GetPrograms({});

    expect(filtersService.GetPrograms).toHaveBeenCalledWith(undefined);
  });

  it('should return roles from the filters service', () => {
    const result = controller.GetRoles();

    expect(filtersService.GetRoles).toHaveBeenCalled();
    expect(result).toEqual({ roles: Object.values(UserRole) });
  });
});
