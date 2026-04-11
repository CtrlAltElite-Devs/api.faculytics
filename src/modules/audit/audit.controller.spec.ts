import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/security/guards/roles.guard';
import { AuditController } from './audit.controller';
import { AuditQueryService } from './audit-query.service';
import { ListAuditLogsQueryDto } from './dto/requests/list-audit-logs-query.dto';

describe('AuditController', () => {
  let controller: AuditController;
  let auditQueryService: {
    ListAuditLogs: jest.Mock;
    GetAuditLog: jest.Mock;
  };

  beforeEach(async () => {
    auditQueryService = {
      ListAuditLogs: jest.fn().mockResolvedValue({
        data: [],
        meta: {
          totalItems: 0,
          itemCount: 0,
          itemsPerPage: 10,
          totalPages: 0,
          currentPage: 1,
        },
      }),
      GetAuditLog: jest.fn().mockResolvedValue({
        id: 'log-1',
        action: 'auth.login.success',
        occurredAt: new Date(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditController],
      providers: [{ provide: AuditQueryService, useValue: auditQueryService }],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(AuditController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should delegate audit log listing to the query service', async () => {
    const query: ListAuditLogsQueryDto = {
      action: 'auth.login.success',
      page: 2,
      limit: 15,
    };

    await controller.ListAuditLogs(query);

    expect(auditQueryService.ListAuditLogs).toHaveBeenCalledWith(query);
  });

  it('should delegate single audit log retrieval to the query service', async () => {
    await controller.GetAuditLog('log-1');

    expect(auditQueryService.GetAuditLog).toHaveBeenCalledWith('log-1');
  });
});
