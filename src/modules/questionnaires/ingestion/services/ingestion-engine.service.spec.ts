import { Test, TestingModule } from '@nestjs/testing';
import {
  IngestionEngine,
  DryRunRollbackError,
} from './ingestion-engine.service';
import { EntityManager } from '@mikro-orm/core';
import { QuestionnaireService } from 'src/modules/questionnaires/services/questionnaire.service';
import { IngestionMapperService } from './ingestion-mapper.service';
import { QuestionnaireSubmission } from 'src/entities/questionnaire-submission.entity';
import { SourceAdapter } from '../interfaces/source-adapter.interface';
import { RawSubmissionData } from '../dto/raw-submission-data.dto';
import { MappedSubmission } from './ingestion-mapper.service';

describe('IngestionEngine', () => {
  let service: IngestionEngine;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let em: jest.Mocked<EntityManager>;
  let questionnaireService: jest.Mocked<QuestionnaireService>;
  let mapper: jest.Mocked<IngestionMapperService>;

  beforeEach(async () => {
    const mockForkedEm = {
      transactional: jest
        .fn()
        .mockImplementation(async (cb: (em: any) => Promise<void>) => {
          try {
            await cb({} as any);
          } catch (e: unknown) {
            if (!(e instanceof DryRunRollbackError)) {
              throw e;
            }
          }
        }),
      clear: jest.fn(),
      fork: jest.fn().mockReturnThis(),
    };

    const mockEm = {
      fork: jest.fn().mockReturnValue(mockForkedEm),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IngestionEngine,
        {
          provide: EntityManager,
          useValue: mockEm,
        },
        {
          provide: QuestionnaireService,
          useValue: {
            submitQuestionnaire: jest.fn(),
          },
        },
        {
          provide: IngestionMapperService,
          useValue: {
            map: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<IngestionEngine>(IngestionEngine);
    em = module.get(EntityManager);
    questionnaireService = module.get(QuestionnaireService);
    mapper = module.get(IngestionMapperService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should process a stream in dry-run mode', async () => {
    const mockAdapter: SourceAdapter<unknown, RawSubmissionData> = {
      // eslint-disable-next-line @typescript-eslint/require-await
      async *extract() {
        yield {
          data: { externalId: '1' } as RawSubmissionData,
          sourceIdentifier: '1',
        };
      },
      close: jest.fn().mockResolvedValue(undefined),
    };

    mapper.map.mockResolvedValue({
      success: true,
      data: { externalId: '1' } as MappedSubmission,
    });
    questionnaireService.submitQuestionnaire.mockResolvedValue({
      id: 'sub-1',
    } as QuestionnaireSubmission);

    const result = await service.processStream(
      mockAdapter,
      {},
      { dryRun: true },
      'v1',
    );

    expect(result.successes).toBe(1);
    expect(result.dryRun).toBe(true);
    expect(result.records[0].internalId).toBe('sub-1');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockAdapter.close).toHaveBeenCalled();
  });
});
