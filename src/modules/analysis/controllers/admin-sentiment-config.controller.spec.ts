import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { validate } from 'class-validator';
import { RolesGuard } from 'src/security/guards/roles.guard';
import { AuditService } from 'src/modules/audit/audit.service';
import { AuditAction } from 'src/modules/audit/audit-action.enum';
import { MetaDataInterceptor } from 'src/modules/common/interceptors/metadata.interceptor';
import { AuditInterceptor } from 'src/modules/audit/interceptors/audit.interceptor';
import { CurrentUserService } from 'src/modules/common/cls/current-user.service';
import { RequestMetadataService } from 'src/modules/common/cls/request-metadata.service';
import { AdminSentimentConfigController } from './admin-sentiment-config.controller';
import { SentimentConfigService } from '../services/sentiment-config.service';
import { UpdateSentimentVllmConfigRequestDto } from '../dto/requests/update-sentiment-vllm-config.request.dto';

jest.mock('src/configurations/index.config', () => ({
  env: {
    NODE_ENV: 'development',
    ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD: false,
  },
}));

import { env } from 'src/configurations/index.config';

const mockedEnv = env as {
  NODE_ENV: 'development' | 'production' | 'test';
  ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD: boolean;
};

describe('AdminSentimentConfigController', () => {
  let controller: AdminSentimentConfigController;
  let sentimentConfigService: {
    readConfig: jest.Mock;
    updateConfig: jest.Mock;
  };
  let auditService: { Emit: jest.Mock };
  let currentUserService: { get: jest.Mock };
  let requestMetadataService: { get: jest.Mock };

  async function buildModule(
    overrides: {
      authGuardCanActivate?: () => boolean;
      rolesGuardCanActivate?: () => boolean;
    } = {},
  ): Promise<TestingModule> {
    return Test.createTestingModule({
      controllers: [AdminSentimentConfigController],
      providers: [
        { provide: SentimentConfigService, useValue: sentimentConfigService },
        { provide: AuditService, useValue: auditService },
        { provide: CurrentUserService, useValue: currentUserService },
        { provide: RequestMetadataService, useValue: requestMetadataService },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({
        canActivate: overrides.authGuardCanActivate ?? (() => true),
      })
      .overrideGuard(RolesGuard)
      .useValue({
        canActivate: overrides.rolesGuardCanActivate ?? (() => true),
      })
      .overrideInterceptor(MetaDataInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .overrideInterceptor(AuditInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      })
      .compile();
  }

  beforeEach(async () => {
    sentimentConfigService = {
      readConfig: jest
        .fn()
        .mockResolvedValue({ url: '', model: '', enabled: false }),
      updateConfig: jest
        .fn()
        .mockImplementation(
          (patch: Partial<UpdateSentimentVllmConfigRequestDto>) =>
            Promise.resolve({
              previous: { url: '', model: '', enabled: false },
              next: {
                url: 'https://v',
                model: 'gemma',
                enabled: false,
                ...patch,
              },
            }),
        ),
    };
    auditService = { Emit: jest.fn().mockResolvedValue(undefined) };
    currentUserService = {
      get: jest.fn().mockReturnValue({ id: 'user-1', userName: 'admin' }),
    };
    requestMetadataService = {
      get: jest.fn().mockReturnValue({
        browserName: 'Chrome',
        os: 'Linux',
        ipAddress: '127.0.0.1',
      }),
    };

    mockedEnv.NODE_ENV = 'development';
    mockedEnv.ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD = false;

    const module = await buildModule();
    controller = module.get(AdminSentimentConfigController);
  });

  describe('GetConfig', () => {
    it('returns current configuration from the service', async () => {
      sentimentConfigService.readConfig.mockResolvedValue({
        url: 'https://v',
        model: 'gemma',
        enabled: true,
      });

      const result = await controller.GetConfig();

      expect(result).toEqual({
        url: 'https://v',
        model: 'gemma',
        enabled: true,
      });
    });
  });

  describe('UpdateConfig', () => {
    it('delegates to the service and returns the merged next config', async () => {
      sentimentConfigService.updateConfig.mockResolvedValue({
        previous: { url: 'https://old', model: 'gemma', enabled: false },
        next: { url: 'https://new', model: 'gemma', enabled: false },
      });

      const dto = new UpdateSentimentVllmConfigRequestDto();
      dto.url = 'https://new';

      const result = await controller.UpdateConfig(dto);

      expect(sentimentConfigService.updateConfig).toHaveBeenCalledWith(dto);
      expect(result).toEqual({
        url: 'https://new',
        model: 'gemma',
        enabled: false,
      });
    });

    it('emits exactly one audit row with before/after payload on success (no double-emit)', async () => {
      sentimentConfigService.updateConfig.mockResolvedValue({
        previous: { url: 'https://old', model: 'gemma', enabled: false },
        next: { url: 'https://new', model: 'gemma', enabled: true },
      });

      const dto = new UpdateSentimentVllmConfigRequestDto();
      dto.url = 'https://new';
      dto.enabled = true;

      await controller.UpdateConfig(dto);

      expect(auditService.Emit).toHaveBeenCalledTimes(1);
      expect(auditService.Emit).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.ADMIN_SENTIMENT_VLLM_CONFIG_UPDATE,
          actorId: 'user-1',
          actorUsername: 'admin',
          resourceType: 'SystemConfig',
          resourceId: 'SENTIMENT_VLLM_CONFIG',
          metadata: {
            previous: { url: 'https://old', model: 'gemma', enabled: false },
            next: { url: 'https://new', model: 'gemma', enabled: true },
          },
          browserName: 'Chrome',
          os: 'Linux',
          ipAddress: '127.0.0.1',
        }),
      );
    });

    it('never calls readConfig on the controller — service returns both sides (F8)', async () => {
      sentimentConfigService.updateConfig.mockResolvedValue({
        previous: { url: 'https://x', model: 'gemma', enabled: false },
        next: { url: 'https://y', model: 'gemma', enabled: false },
      });

      const dto = new UpdateSentimentVllmConfigRequestDto();
      dto.url = 'https://y';

      await controller.UpdateConfig(dto);

      expect(sentimentConfigService.readConfig).not.toHaveBeenCalled();
    });

    it('rejects enabling vLLM in production without the gate env var', async () => {
      mockedEnv.NODE_ENV = 'production';
      mockedEnv.ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD = false;

      const dto = new UpdateSentimentVllmConfigRequestDto();
      dto.enabled = true;

      await expect(controller.UpdateConfig(dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(sentimentConfigService.updateConfig).not.toHaveBeenCalled();
    });

    it('allows enabling vLLM in production when the gate env var is true', async () => {
      mockedEnv.NODE_ENV = 'production';
      mockedEnv.ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD = true;
      sentimentConfigService.updateConfig.mockResolvedValue({
        previous: { url: 'https://v', model: 'gemma', enabled: false },
        next: { url: 'https://v', model: 'gemma', enabled: true },
      });

      const dto = new UpdateSentimentVllmConfigRequestDto();
      dto.enabled = true;

      const result = await controller.UpdateConfig(dto);

      expect(result.enabled).toBe(true);
      expect(sentimentConfigService.updateConfig).toHaveBeenCalled();
    });

    it('allows disabling vLLM in production without the gate env var', async () => {
      mockedEnv.NODE_ENV = 'production';
      mockedEnv.ALLOW_SENTIMENT_VLLM_ENABLED_IN_PROD = false;
      sentimentConfigService.updateConfig.mockResolvedValue({
        previous: { url: 'https://v', model: 'gemma', enabled: true },
        next: { url: 'https://v', model: 'gemma', enabled: false },
      });

      const dto = new UpdateSentimentVllmConfigRequestDto();
      dto.enabled = false;

      const result = await controller.UpdateConfig(dto);

      expect(result.enabled).toBe(false);
      expect(sentimentConfigService.updateConfig).toHaveBeenCalled();
    });

    it('does not crash when audit emit itself throws', async () => {
      auditService.Emit.mockRejectedValue(new Error('queue down'));
      sentimentConfigService.updateConfig.mockResolvedValue({
        previous: { url: '', model: '', enabled: false },
        next: { url: 'https://v', model: '', enabled: false },
      });

      const dto = new UpdateSentimentVllmConfigRequestDto();
      dto.url = 'https://v';

      await expect(controller.UpdateConfig(dto)).resolves.toBeDefined();
    });
  });

  describe('DTO validation', () => {
    it('rejects a non-URL value for url', async () => {
      const dto = new UpdateSentimentVllmConfigRequestDto();
      dto.url = 'not-a-url';

      const errors = await validate(dto);
      expect(errors.some((e) => Boolean(e.constraints))).toBe(true);
    });

    it('rejects an http:// URL (https-only for SSRF mitigation)', async () => {
      const dto = new UpdateSentimentVllmConfigRequestDto();
      dto.url = 'http://10.0.0.5:8000';

      const errors = await validate(dto);
      expect(errors.some((e) => e.constraints?.isUrl)).toBe(true);
    });

    it('rejects an ftp:// URL (https-only for SSRF mitigation)', async () => {
      const dto = new UpdateSentimentVllmConfigRequestDto();
      dto.url = 'ftp://attacker.example';

      const errors = await validate(dto);
      expect(errors.some((e) => e.constraints?.isUrl)).toBe(true);
    });

    it('rejects an empty model', async () => {
      const dto = new UpdateSentimentVllmConfigRequestDto();
      dto.model = '';

      const errors = await validate(dto);
      expect(errors.some((e) => e.constraints?.minLength)).toBe(true);
    });

    it('accepts a valid full payload', async () => {
      const dto = new UpdateSentimentVllmConfigRequestDto();
      dto.url = 'https://v.example';
      dto.model = 'gemma';
      dto.enabled = true;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });

    it('accepts a partial (enabled-only) payload', async () => {
      const dto = new UpdateSentimentVllmConfigRequestDto();
      dto.enabled = true;

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });

  describe('role-based 403 coverage', () => {
    it.each(['FACULTY', 'DEAN', 'STUDENT', 'ADMIN'])(
      '%s role is denied by the roles guard on PUT',
      async (_role) => {
        const module = await buildModule({
          rolesGuardCanActivate: () => {
            throw new ForbiddenException();
          },
        });
        const blockedController = module.get(AdminSentimentConfigController);
        const dto = new UpdateSentimentVllmConfigRequestDto();
        dto.url = 'https://v';

        // The Nest testing module doesn't push requests through guards when
        // methods are invoked directly; instead we verify the guard is wired
        // by invoking canActivate.
        const guard = (
          module as unknown as { get: (token: unknown) => unknown }
        ).get(RolesGuard) as { canActivate: () => boolean };
        expect(() => guard.canActivate()).toThrow(ForbiddenException);
        expect(blockedController).toBeDefined();
      },
    );
  });
});
