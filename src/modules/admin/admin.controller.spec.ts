import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/security/guards/roles.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './services/admin.service';
import { ListUsersQueryDto } from './dto/requests/list-users-query.dto';

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: { ListUsers: jest.Mock };

  beforeEach(async () => {
    adminService = {
      ListUsers: jest.fn().mockResolvedValue({
        data: [],
        meta: {
          totalItems: 0,
          itemCount: 0,
          itemsPerPage: 20,
          totalPages: 0,
          currentPage: 1,
        },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: adminService,
        },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AdminController);
  });

  it('should delegate user listing to the admin service', async () => {
    const query: ListUsersQueryDto = {
      search: 'john',
      role: undefined,
      isActive: true,
      page: 2,
      limit: 10,
    };

    await controller.ListUsers(query);

    expect(adminService.ListUsers).toHaveBeenCalledWith(query);
  });
});
