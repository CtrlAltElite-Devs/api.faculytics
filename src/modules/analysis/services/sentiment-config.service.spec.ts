import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import { SystemConfig } from 'src/entities/system-config.entity';
import { SentimentConfigService } from './sentiment-config.service';

describe('SentimentConfigService', () => {
  let service: SentimentConfigService;
  let em: {
    findOne: jest.Mock;
    fork: jest.Mock;
  };
  let fork: {
    findOne: jest.Mock;
    create: jest.Mock;
    persist: jest.Mock;
    flush: jest.Mock;
  };

  beforeEach(async () => {
    fork = {
      findOne: jest.fn(),
      create: jest.fn((_entity: unknown, data: Record<string, unknown>) => ({
        ...data,
      })),
      persist: jest.fn(),
      flush: jest.fn().mockResolvedValue(undefined),
    };
    em = {
      findOne: jest.fn(),
      fork: jest.fn().mockReturnValue(fork),
    };

    const module = await Test.createTestingModule({
      providers: [
        SentimentConfigService,
        { provide: EntityManager, useValue: em },
      ],
    }).compile();

    service = module.get(SentimentConfigService);
  });

  describe('readConfig', () => {
    it('returns defaults when no row exists', async () => {
      em.findOne.mockResolvedValue(null);
      await expect(service.readConfig()).resolves.toEqual({
        url: '',
        model: '',
        enabled: false,
      });
      expect(em.findOne).toHaveBeenCalledWith(SystemConfig, {
        key: 'SENTIMENT_VLLM_CONFIG',
      });
    });

    it('parses JSON value when row exists', async () => {
      em.findOne.mockResolvedValue({
        value: JSON.stringify({
          url: 'https://v',
          model: 'gemma',
          enabled: true,
        }),
      });
      await expect(service.readConfig()).resolves.toEqual({
        url: 'https://v',
        model: 'gemma',
        enabled: true,
      });
    });

    it('falls back to defaults on unparseable JSON', async () => {
      em.findOne.mockResolvedValue({ value: '{not json' });
      await expect(service.readConfig()).resolves.toEqual({
        url: '',
        model: '',
        enabled: false,
      });
    });
  });

  describe('updateConfig', () => {
    it('merges patch onto current value and updates the existing row without touching description', async () => {
      em.findOne.mockResolvedValue({
        value: JSON.stringify({
          url: 'https://old',
          model: 'gemma',
          enabled: true,
        }),
      });
      const existingRow = {
        key: 'SENTIMENT_VLLM_CONFIG',
        value: JSON.stringify({
          url: 'https://old',
          model: 'gemma',
          enabled: true,
        }),
        description: 'operator custom description',
      };
      fork.findOne.mockResolvedValue(existingRow);

      const result = await service.updateConfig({ url: 'https://new' });

      expect(result.previous).toEqual({
        url: 'https://old',
        model: 'gemma',
        enabled: true,
      });
      expect(result.next).toEqual({
        url: 'https://new',
        model: 'gemma',
        enabled: true,
      });
      // The mutation path modifies the existing row in place (keeps description)
      expect(existingRow.value).toBe(
        JSON.stringify({ url: 'https://new', model: 'gemma', enabled: true }),
      );
      expect(existingRow.description).toBe('operator custom description');
      expect(fork.flush).toHaveBeenCalledTimes(1);
      expect(fork.persist).not.toHaveBeenCalled();
    });

    it('creates a new row with canonical description when none exists', async () => {
      em.findOne.mockResolvedValue(null);
      fork.findOne.mockResolvedValue(null);

      const result = await service.updateConfig({
        url: 'https://new',
        model: 'gemma',
        enabled: false,
      });

      expect(result.previous).toEqual({
        url: '',
        model: '',
        enabled: false,
      });
      expect(result.next).toEqual({
        url: 'https://new',
        model: 'gemma',
        enabled: false,
      });
      expect(fork.persist).toHaveBeenCalledTimes(1);
      const persistCalls = fork.persist.mock.calls as Array<
        [{ description: string }]
      >;
      expect(persistCalls[0][0].description).toContain('vLLM');
    });

    it('preserves untouched fields when toggling enabled only', async () => {
      em.findOne.mockResolvedValue({
        value: JSON.stringify({
          url: 'https://v',
          model: 'gemma',
          enabled: false,
        }),
      });
      const row = {
        key: 'SENTIMENT_VLLM_CONFIG',
        value: JSON.stringify({
          url: 'https://v',
          model: 'gemma',
          enabled: false,
        }),
        description: 'd',
      };
      fork.findOne.mockResolvedValue(row);

      const result = await service.updateConfig({ enabled: true });

      expect(result.next).toEqual({
        url: 'https://v',
        model: 'gemma',
        enabled: true,
      });
    });

    it('rejects enabling vLLM when url is empty (cross-field validation)', async () => {
      em.findOne.mockResolvedValue({
        value: JSON.stringify({ url: '', model: 'gemma', enabled: false }),
      });

      await expect(service.updateConfig({ enabled: true })).rejects.toThrow(
        BadRequestException,
      );
      expect(fork.flush).not.toHaveBeenCalled();
    });

    it('rejects enabling vLLM when url is whitespace only', async () => {
      em.findOne.mockResolvedValue({
        value: JSON.stringify({
          url: '   ',
          model: 'gemma',
          enabled: false,
        }),
      });

      await expect(service.updateConfig({ enabled: true })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects enabling vLLM when model is empty (F12)', async () => {
      em.findOne.mockResolvedValue({
        value: JSON.stringify({
          url: 'https://v',
          model: '',
          enabled: false,
        }),
      });

      await expect(service.updateConfig({ enabled: true })).rejects.toThrow(
        'Cannot enable vLLM with empty model',
      );
      expect(fork.flush).not.toHaveBeenCalled();
    });

    it('allows enabling when url + model are both provided in the patch', async () => {
      em.findOne.mockResolvedValue({
        value: JSON.stringify({ url: '', model: '', enabled: false }),
      });
      fork.findOne.mockResolvedValue(null);

      const result = await service.updateConfig({
        url: 'https://new',
        model: 'gemma',
        enabled: true,
      });

      expect(result.next.enabled).toBe(true);
      expect(result.next.url).toBe('https://new');
      expect(result.next.model).toBe('gemma');
      expect(fork.persist).toHaveBeenCalled();
    });
  });
});
