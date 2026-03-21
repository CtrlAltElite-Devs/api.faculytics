/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  NotFoundException,
} from '@nestjs/common';
import { QuestionnaireController } from './questionnaire.controller';
import { QuestionnaireService } from './services/questionnaire.service';
import { IngestionEngine } from './ingestion/services/ingestion-engine.service';
import { CSVAdapter } from './ingestion/adapters/csv.adapter';
import { IngestionResultDto } from './ingestion/dto/ingestion-result.dto';
import { QuestionnaireSchemaSnapshot } from './lib/questionnaire.types';
import { RolesGuard } from 'src/security/guards/roles.guard';
import { CurrentUserInterceptor } from '../common/interceptors/current-user.interceptor';
import { AuthGuard } from '@nestjs/passport';

describe('QuestionnaireController - IngestCsv', () => {
  let controller: QuestionnaireController;
  let questionnaireService: jest.Mocked<QuestionnaireService>;
  let ingestionEngine: jest.Mocked<IngestionEngine>;
  let csvAdapter: CSVAdapter;

  const QUESTION_A = 'a3f1b2c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c';
  const QUESTION_B = 'b7e2d9f1-c3a4-5b6d-7e8f-9a0b1c2d3e4f';
  const VERSION_ID = '550e8400-e29b-41d4-a716-446655440000';

  const mockSchema: QuestionnaireSchemaSnapshot = {
    meta: {
      questionnaireType: 'FACULTY_IN_CLASSROOM',
      scoringModel: 'SECTION_WEIGHTED',
      version: 1,
      maxScore: 5,
    },
    sections: [
      {
        id: 'section-1',
        title: 'Teaching',
        order: 1,
        weight: 100,
        questions: [
          {
            id: QUESTION_A,
            text: 'Q1',
            type: 'LIKERT',
            dimensionCode: 'TEACH',
            required: true,
            order: 1,
          },
          {
            id: QUESTION_B,
            text: 'Q2',
            type: 'LIKERT',
            dimensionCode: 'TEACH',
            required: true,
            order: 2,
          },
        ],
      },
    ],
  };

  const mockVersion = {
    id: VERSION_ID,
    isActive: true,
    schemaSnapshot: mockSchema,
  };

  const mockIngestionResult: IngestionResultDto = {
    ingestionId: 'test-ingestion-id',
    total: 2,
    successes: 2,
    failures: 0,
    dryRun: false,
    records: [
      { externalId: 'sub_001', success: true, internalId: 'id-1' },
      { externalId: 'sub_002', success: true, internalId: 'id-2' },
    ],
  };

  const createMockFile = (
    content = 'externalId,username,facultyUsername,courseShortname,q1\nsub_001,student001,faculty001,CS101,4',
    originalname = 'test.csv',
    mimetype = 'text/csv',
  ): Express.Multer.File =>
    ({
      buffer: Buffer.from(content),
      originalname,
      mimetype,
      fieldname: 'file',
      size: Buffer.byteLength(content),
    }) as Express.Multer.File;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuestionnaireController],
      providers: [
        {
          provide: QuestionnaireService,
          useValue: {
            GetVersionById: jest.fn(),
            GetAllQuestions: jest.fn(),
            getQuestionnaireTypes: jest.fn(),
            getVersionsByType: jest.fn(),
            createQuestionnaire: jest.fn(),
            CreateVersion: jest.fn(),
            GetLatestActiveVersion: jest.fn(),
            PublishVersion: jest.fn(),
            DeprecateVersion: jest.fn(),
            UpdateDraftVersion: jest.fn(),
            submitQuestionnaire: jest.fn(),
            SaveOrUpdateDraft: jest.fn(),
            GetDraft: jest.fn(),
            ListMyDrafts: jest.fn(),
            DeleteDraft: jest.fn(),
          },
        },
        {
          provide: IngestionEngine,
          useValue: {
            processStream: jest.fn(),
          },
        },
        {
          provide: CSVAdapter,
          useValue: new CSVAdapter(),
        },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CurrentUserInterceptor)
      .useValue({
        intercept: (_ctx: ExecutionContext, next: CallHandler) => next.handle(),
      })
      .compile();

    controller = module.get(QuestionnaireController);
    questionnaireService = module.get(QuestionnaireService);
    ingestionEngine = module.get(IngestionEngine);
    csvAdapter = module.get(CSVAdapter);
  });

  describe('happy path', () => {
    it('should process a valid CSV and return ingestion result', async () => {
      questionnaireService.GetVersionById.mockResolvedValue(mockVersion as any);
      questionnaireService.GetAllQuestions.mockReturnValue(
        mockSchema.sections[0].questions,
      );
      ingestionEngine.processStream.mockResolvedValue(mockIngestionResult);

      const result = await controller.IngestCsv(createMockFile(), {
        versionId: VERSION_ID,
      });

      expect(result).toEqual(mockIngestionResult);
      expect(questionnaireService.GetVersionById).toHaveBeenCalledWith(
        VERSION_ID,
      );
      expect(ingestionEngine.processStream).toHaveBeenCalledWith(
        csvAdapter,
        expect.any(Object),
        expect.objectContaining({
          dryRun: false,
          questionIds: [QUESTION_A, QUESTION_B],
        }),
        VERSION_ID,
      );
    });

    it('should default maxRecords to 500', async () => {
      questionnaireService.GetVersionById.mockResolvedValue(mockVersion as any);
      questionnaireService.GetAllQuestions.mockReturnValue(
        mockSchema.sections[0].questions,
      );
      ingestionEngine.processStream.mockResolvedValue(mockIngestionResult);

      await controller.IngestCsv(createMockFile(), {
        versionId: VERSION_ID,
      });

      expect(ingestionEngine.processStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ maxRecords: 500 }),
        expect.anything(),
      );
    });
  });

  describe('file validation', () => {
    it('should throw 400 when no file is uploaded', async () => {
      await expect(
        controller.IngestCsv(undefined as any, { versionId: VERSION_ID }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('version validation', () => {
    it('should throw when version is not found', async () => {
      questionnaireService.GetVersionById.mockRejectedValue(
        new NotFoundException(`Version ${VERSION_ID} not found`),
      );

      await expect(
        controller.IngestCsv(createMockFile(), { versionId: VERSION_ID }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw 400 when version is not active', async () => {
      questionnaireService.GetVersionById.mockResolvedValue({
        ...mockVersion,
        isActive: false,
      } as any);

      await expect(
        controller.IngestCsv(createMockFile(), { versionId: VERSION_ID }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('dry-run mode', () => {
    it('should pass dryRun flag to engine config', async () => {
      questionnaireService.GetVersionById.mockResolvedValue(mockVersion as any);
      questionnaireService.GetAllQuestions.mockReturnValue(
        mockSchema.sections[0].questions,
      );
      const dryRunResult: IngestionResultDto = {
        ...mockIngestionResult,
        dryRun: true,
        records: mockIngestionResult.records.map((r) => ({
          ...r,
          internalId: undefined,
        })),
      };
      ingestionEngine.processStream.mockResolvedValue(dryRunResult);

      const result = await controller.IngestCsv(createMockFile(), {
        versionId: VERSION_ID,
        dryRun: true,
      });

      expect(result.dryRun).toBe(true);
      expect(ingestionEngine.processStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ dryRun: true }),
        expect.anything(),
      );
    });
  });

  describe('config passthrough', () => {
    it('should pass delimiter and maxErrors to engine config', async () => {
      questionnaireService.GetVersionById.mockResolvedValue(mockVersion as any);
      questionnaireService.GetAllQuestions.mockReturnValue(
        mockSchema.sections[0].questions,
      );
      ingestionEngine.processStream.mockResolvedValue(mockIngestionResult);

      await controller.IngestCsv(createMockFile(), {
        versionId: VERSION_ID,
        delimiter: ';',
        maxErrors: 10,
        maxRecords: 100,
      });

      expect(ingestionEngine.processStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          delimiter: ';',
          maxErrors: 10,
          maxRecords: 100,
        }),
        expect.anything(),
      );
    });
  });

  describe('question ID extraction', () => {
    it('should extract question IDs from nested schema sections', async () => {
      const nestedSchema: QuestionnaireSchemaSnapshot = {
        ...mockSchema,
        sections: [
          {
            id: 'parent',
            title: 'Parent',
            order: 1,
            sections: [
              {
                id: 'child',
                title: 'Child',
                order: 1,
                weight: 100,
                questions: [
                  {
                    id: 'nested-q1',
                    text: 'Nested Q1',
                    type: 'LIKERT',
                    dimensionCode: 'DIM',
                    required: true,
                    order: 1,
                  },
                ],
              },
            ],
          },
        ],
      };

      questionnaireService.GetVersionById.mockResolvedValue({
        ...mockVersion,
        schemaSnapshot: nestedSchema,
      } as any);
      questionnaireService.GetAllQuestions.mockReturnValue(
        nestedSchema.sections[0].sections![0].questions,
      );
      ingestionEngine.processStream.mockResolvedValue(mockIngestionResult);

      await controller.IngestCsv(createMockFile(), {
        versionId: VERSION_ID,
      });

      expect(ingestionEngine.processStream).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ questionIds: ['nested-q1'] }),
        expect.anything(),
      );
    });
  });
});

describe('QuestionnaireController - wipeSubmissions', () => {
  let controller: QuestionnaireController;
  let questionnaireService: jest.Mocked<QuestionnaireService>;

  const VERSION_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuestionnaireController],
      providers: [
        {
          provide: QuestionnaireService,
          useValue: {
            GetVersionById: jest.fn(),
            GetAllQuestions: jest.fn(),
            getQuestionnaireTypes: jest.fn(),
            getVersionsByType: jest.fn(),
            createQuestionnaire: jest.fn(),
            CreateVersion: jest.fn(),
            GetLatestActiveVersion: jest.fn(),
            PublishVersion: jest.fn(),
            DeprecateVersion: jest.fn(),
            UpdateDraftVersion: jest.fn(),
            submitQuestionnaire: jest.fn(),
            SaveOrUpdateDraft: jest.fn(),
            GetDraft: jest.fn(),
            ListMyDrafts: jest.fn(),
            DeleteDraft: jest.fn(),
            WipeSubmissions: jest.fn(),
          },
        },
        {
          provide: IngestionEngine,
          useValue: { processStream: jest.fn() },
        },
        {
          provide: CSVAdapter,
          useValue: new CSVAdapter(),
        },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CurrentUserInterceptor)
      .useValue({
        intercept: (_ctx: ExecutionContext, next: CallHandler) => next.handle(),
      })
      .compile();

    controller = module.get(QuestionnaireController);
    questionnaireService = module.get(QuestionnaireService);
  });

  it('should delegate to service and return result', async () => {
    questionnaireService.WipeSubmissions.mockResolvedValue({
      deletedCount: 5,
    });

    const result = await controller.wipeSubmissions(VERSION_ID);

    expect(result).toEqual({ deletedCount: 5 });
    expect(questionnaireService.WipeSubmissions).toHaveBeenCalledWith(
      VERSION_ID,
    );
  });

  it('should propagate NotFoundException from service', async () => {
    questionnaireService.WipeSubmissions.mockRejectedValue(
      new NotFoundException(`Version ${VERSION_ID} not found`),
    );

    await expect(controller.wipeSubmissions(VERSION_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('QuestionnaireController - GetCsvTemplate', () => {
  let controller: QuestionnaireController;
  let questionnaireService: jest.Mocked<QuestionnaireService>;

  const QUESTION_A = 'a3f1b2c4-d5e6-7f8a-9b0c-1d2e3f4a5b6c';
  const QUESTION_B = 'b7e2d9f1-c3a4-5b6d-7e8f-9a0b1c2d3e4f';
  const VERSION_ID = '550e8400-e29b-41d4-a716-446655440000';

  const mockSchema: QuestionnaireSchemaSnapshot = {
    meta: {
      questionnaireType: 'FACULTY_IN_CLASSROOM',
      scoringModel: 'SECTION_WEIGHTED',
      version: 1,
      maxScore: 5,
    },
    sections: [
      {
        id: 'section-1',
        title: 'Teaching',
        order: 1,
        weight: 100,
        questions: [
          {
            id: QUESTION_A,
            text: 'Q1',
            type: 'LIKERT',
            dimensionCode: 'TEACH',
            required: true,
            order: 1,
          },
          {
            id: QUESTION_B,
            text: 'Q2',
            type: 'LIKERT',
            dimensionCode: 'TEACH',
            required: true,
            order: 2,
          },
        ],
      },
    ],
  };

  const mockVersion = {
    id: VERSION_ID,
    isActive: true,
    schemaSnapshot: mockSchema,
  };

  const createMockResponse = () => {
    const res = {
      setHeader: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    } as unknown as Response;
    return res;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuestionnaireController],
      providers: [
        {
          provide: QuestionnaireService,
          useValue: {
            GetVersionById: jest.fn(),
            GetAllQuestions: jest.fn(),
            getQuestionnaireTypes: jest.fn(),
            getVersionsByType: jest.fn(),
            createQuestionnaire: jest.fn(),
            CreateVersion: jest.fn(),
            GetLatestActiveVersion: jest.fn(),
            PublishVersion: jest.fn(),
            DeprecateVersion: jest.fn(),
            UpdateDraftVersion: jest.fn(),
            submitQuestionnaire: jest.fn(),
            SaveOrUpdateDraft: jest.fn(),
            GetDraft: jest.fn(),
            ListMyDrafts: jest.fn(),
            DeleteDraft: jest.fn(),
          },
        },
        {
          provide: IngestionEngine,
          useValue: { processStream: jest.fn() },
        },
        {
          provide: CSVAdapter,
          useValue: new CSVAdapter(),
        },
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CurrentUserInterceptor)
      .useValue({
        intercept: (_ctx: ExecutionContext, next: CallHandler) => next.handle(),
      })
      .compile();

    controller = module.get(QuestionnaireController);
    questionnaireService = module.get(QuestionnaireService);
  });

  it('should return CSV with correct headers for an active version', async () => {
    questionnaireService.GetVersionById.mockResolvedValue(mockVersion as any);
    questionnaireService.GetAllQuestions.mockReturnValue(
      mockSchema.sections[0].questions,
    );

    const res = createMockResponse();
    await controller.GetCsvTemplate(VERSION_ID, res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      `attachment; filename="template-${VERSION_ID}.csv"`,
    );

    const csv = (res.send as jest.Mock).mock.calls[0][0] as string;
    const [headerRow, dataRow] = csv.split('\n');

    expect(headerRow).toBe(
      `externalId,username,facultyUsername,courseShortname,${QUESTION_A},${QUESTION_B},comment`,
    );

    const dataColumns = dataRow.split(',');
    // 4 fixed columns + 2 question columns + 1 comment = 7
    expect(dataColumns).toHaveLength(7);
  });

  it('should throw 404 when version is not found', async () => {
    questionnaireService.GetVersionById.mockRejectedValue(
      new NotFoundException(`Version ${VERSION_ID} not found`),
    );

    const res = createMockResponse();
    await expect(controller.GetCsvTemplate(VERSION_ID, res)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw 400 when version is not active', async () => {
    questionnaireService.GetVersionById.mockResolvedValue({
      ...mockVersion,
      isActive: false,
    } as any);

    const res = createMockResponse();
    await expect(controller.GetCsvTemplate(VERSION_ID, res)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should include all question IDs from schema in header', async () => {
    questionnaireService.GetVersionById.mockResolvedValue(mockVersion as any);
    questionnaireService.GetAllQuestions.mockReturnValue(
      mockSchema.sections[0].questions,
    );

    const res = createMockResponse();
    await controller.GetCsvTemplate(VERSION_ID, res);

    const csv = (res.send as jest.Mock).mock.calls[0][0] as string;
    const headerRow = csv.split('\n')[0];

    expect(headerRow).toContain(QUESTION_A);
    expect(headerRow).toContain(QUESTION_B);
  });

  it('should have matching column count in header and example rows', async () => {
    questionnaireService.GetVersionById.mockResolvedValue(mockVersion as any);
    questionnaireService.GetAllQuestions.mockReturnValue(
      mockSchema.sections[0].questions,
    );

    const res = createMockResponse();
    await controller.GetCsvTemplate(VERSION_ID, res);

    const csv = (res.send as jest.Mock).mock.calls[0][0] as string;
    const [headerRow, dataRow] = csv.split('\n');

    expect(headerRow.split(',').length).toBe(dataRow.split(',').length);
  });
});
