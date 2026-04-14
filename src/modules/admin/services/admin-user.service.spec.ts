import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { User } from 'src/entities/user.entity';
import { Campus } from 'src/entities/campus.entity';
import { InstitutionalRoleSource } from 'src/entities/user-institutional-role.entity';
import { AuditService } from 'src/modules/audit/audit.service';
import { AuditAction } from 'src/modules/audit/audit-action.enum';
import { CurrentUserService } from 'src/modules/common/cls/current-user.service';
import { RequestMetadataService } from 'src/modules/common/cls/request-metadata.service';
import { UserRepository } from 'src/repositories/user.repository';
import { AdminUserService } from './admin-user.service';
import { CreateLocalUserRequestDto } from '../dto/requests/create-user.request.dto';

describe('AdminUserService', () => {
  let service: AdminUserService;
  let em: {
    findOne: jest.Mock;
    create: jest.Mock;
    persistAndFlush: jest.Mock;
  };
  let userRepository: { findOne: jest.Mock };
  let auditService: { Emit: jest.Mock };
  let currentUserService: { getOrFail: jest.Mock };
  let requestMetadataService: { get: jest.Mock };

  const actor = { id: 'actor-1', userName: 'superadmin' };
  const requestMeta = {
    browserName: 'Chrome',
    os: 'Linux',
    ipAddress: '127.0.0.1',
  };

  const baseDto: CreateLocalUserRequestDto = {
    username: 'local-kmartinez',
    firstName: 'K',
    lastName: 'Martinez',
    password: 'TempPass1',
  };

  beforeEach(async () => {
    em = {
      findOne: jest.fn(),
      create: jest
        .fn()
        .mockImplementation(
          (_entity: unknown, data: Record<string, unknown>) => {
            return { id: 'user-1', createdAt: new Date('2026-01-01'), ...data };
          },
        ),
      persistAndFlush: jest.fn().mockResolvedValue(undefined),
    };
    userRepository = { findOne: jest.fn().mockResolvedValue(null) };
    auditService = { Emit: jest.fn().mockResolvedValue(undefined) };
    currentUserService = { getOrFail: jest.fn().mockReturnValue(actor) };
    requestMetadataService = { get: jest.fn().mockReturnValue(requestMeta) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUserService,
        { provide: EntityManager, useValue: em },
        { provide: UserRepository, useValue: userRepository },
        { provide: AuditService, useValue: auditService },
        { provide: CurrentUserService, useValue: currentUserService },
        { provide: RequestMetadataService, useValue: requestMetadataService },
      ],
    }).compile();

    service = module.get(AdminUserService);
  });

  it('creates a local user with manual campus assignment (happy path)', async () => {
    const campus = { id: 'campus-1', code: 'UCMN' } as Campus;
    em.findOne.mockResolvedValueOnce(campus);

    const result = await service.CreateLocalUser({
      ...baseDto,
      campusId: 'campus-1',
    });

    expect(result.username).toBe('local-kmartinez');
    expect(result.fullName).toBe('K Martinez');
    expect(result.campus).toEqual({ id: 'campus-1', code: 'UCMN' });
    expect(result.defaultPasswordAssigned).toBe(false);

    const [, payload] = em.create.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(payload.campusSource).toBe(InstitutionalRoleSource.MANUAL);
    expect(payload.departmentSource).toBe(InstitutionalRoleSource.AUTO);
    expect(payload.programSource).toBe(InstitutionalRoleSource.AUTO);
    expect(payload.isActive).toBe(true);
    expect(payload.userProfilePicture).toBe('');
    expect(payload.lastLoginAt).toBeInstanceOf(Date);
    expect(payload.moodleUserId).toBeUndefined();
    expect(await bcrypt.compare('TempPass1', payload.password as string)).toBe(
      true,
    );
  });

  it('creates a local user without campus (campusSource=AUTO)', async () => {
    const result = await service.CreateLocalUser(baseDto);

    expect(result.campus).toBeNull();

    const [, payload] = em.create.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(payload.campusSource).toBe(InstitutionalRoleSource.AUTO);
  });

  it('assigns default "Head123#" password when password omitted', async () => {
    const { password: _password, ...dtoWithoutPassword } = baseDto;
    void _password;

    const result = await service.CreateLocalUser(
      dtoWithoutPassword as CreateLocalUserRequestDto,
    );

    expect(result.defaultPasswordAssigned).toBe(true);

    const [, payload] = em.create.mock.calls[0] as [
      unknown,
      Record<string, unknown>,
    ];
    expect(await bcrypt.compare('Head123#', payload.password as string)).toBe(
      true,
    );
  });

  it('rejects duplicate username with 409', async () => {
    userRepository.findOne.mockResolvedValueOnce({
      id: 'existing',
      userName: 'local-kmartinez',
    } as User);

    await expect(service.CreateLocalUser(baseDto)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(em.create).not.toHaveBeenCalled();
  });

  it('rejects invalid campusId with 400', async () => {
    em.findOne.mockResolvedValueOnce(null);

    await expect(
      service.CreateLocalUser({ ...baseDto, campusId: 'missing-campus' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(em.create).not.toHaveBeenCalled();
  });

  it('emits audit event with correct metadata shape', async () => {
    const campus = { id: 'campus-1', code: 'UCMN' } as Campus;
    em.findOne.mockResolvedValueOnce(campus);

    await service.CreateLocalUser({ ...baseDto, campusId: 'campus-1' });

    expect(auditService.Emit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.ADMIN_USER_CREATE,
        actorId: actor.id,
        actorUsername: actor.userName,
        resourceType: 'User',
        resourceId: 'user-1',
        metadata: {
          campusId: 'campus-1',
          authMode: 'local',
          defaultPasswordAssigned: false,
        },
        browserName: 'Chrome',
        os: 'Linux',
        ipAddress: '127.0.0.1',
      }),
    );
  });

  it('swallows audit-emit failures (logs only)', async () => {
    auditService.Emit.mockRejectedValueOnce(new Error('queue down'));

    const result = await service.CreateLocalUser(baseDto);
    expect(result.username).toBe('local-kmartinez');
  });

  it('propagates CurrentUserService failure when actor missing', async () => {
    currentUserService.getOrFail.mockImplementationOnce(() => {
      throw new UnauthorizedException();
    });

    const result = await service.CreateLocalUser(baseDto);
    expect(result.username).toBe('local-kmartinez');
    expect(auditService.Emit).not.toHaveBeenCalled();
  });
});
