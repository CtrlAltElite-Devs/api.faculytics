import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard } from '@nestjs/passport';
import { AnalysisController } from './analysis.controller';
import { PipelineOrchestratorService } from './services/pipeline-orchestrator.service';
import { PipelineStatus } from './enums';
import {
  auditTestProviders,
  overrideAuditInterceptors,
} from '../audit/testing/audit-test.helpers';
import { RolesGuard } from 'src/security/guards/roles.guard';
import { CurrentUserInterceptor } from '../common/interceptors/current-user.interceptor';

const makeMockPipeline = (
  overrides: Partial<Record<string, unknown>> = {},
) => ({
  id: 'p1',
  status: PipelineStatus.AWAITING_CONFIRMATION,
  semester: { id: 's1', code: 'S2026' },
  faculty: undefined,
  questionnaireVersion: undefined,
  department: undefined,
  program: undefined,
  campus: undefined,
  course: undefined,
  triggeredBy: { id: 'u1' },
  totalEnrolled: 100,
  submissionCount: 50,
  commentCount: 10,
  responseRate: '0.5000',
  warnings: [],
  errorMessage: undefined,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  confirmedAt: undefined,
  completedAt: undefined,
  ...overrides,
});

describe('AnalysisController', () => {
  let controller: AnalysisController;
  let mockOrchestrator: {
    CreatePipeline: jest.Mock;
    ListPipelines: jest.Mock;
    ConfirmPipeline: jest.Mock;
    CancelPipeline: jest.Mock;
    GetPipelineStatus: jest.Mock;
    GetRecommendations: jest.Mock;
  };

  beforeEach(async () => {
    mockOrchestrator = {
      CreatePipeline: jest.fn(),
      ListPipelines: jest.fn(),
      ConfirmPipeline: jest.fn(),
      CancelPipeline: jest.fn(),
      GetPipelineStatus: jest.fn(),
      GetRecommendations: jest.fn(),
    };

    const builder = Test.createTestingModule({
      controllers: [AnalysisController],
      providers: [
        {
          provide: PipelineOrchestratorService,
          useValue: mockOrchestrator,
        },
        ...auditTestProviders(),
      ],
    })
      .overrideGuard(AuthGuard('jwt'))
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .overrideInterceptor(CurrentUserInterceptor)
      .useValue({
        intercept: (_ctx: unknown, next: { handle: () => unknown }) =>
          next.handle(),
      });
    const module: TestingModule =
      await overrideAuditInterceptors(builder).compile();

    controller = module.get<AnalysisController>(AnalysisController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('CreatePipeline', () => {
    it('should delegate to orchestrator with userId and return mapped DTO', async () => {
      const mockPipeline = makeMockPipeline();
      mockOrchestrator.CreatePipeline.mockResolvedValue(mockPipeline);

      const body = { semesterId: 's1' };
      const req = {
        user: { userId: 'u1', moodleUserId: 1 },
      } as unknown as Parameters<typeof controller.CreatePipeline>[1];

      const result = (await controller.CreatePipeline(
        body,
        req,
      )) as unknown as {
        id: string;
        status: string;
        scope: { semesterId: string };
        coverage: { responseRate: number };
      };

      expect(result.id).toBe('p1');
      expect(result.status).toBe(PipelineStatus.AWAITING_CONFIRMATION);
      expect(result.scope.semesterId).toBe('s1');
      expect(result.coverage.responseRate).toBe(0.5);
      expect(mockOrchestrator.CreatePipeline).toHaveBeenCalledWith(body, 'u1');
    });
  });

  describe('ConfirmPipeline', () => {
    it('should delegate to orchestrator and return mapped DTO', async () => {
      const mockPipeline = makeMockPipeline({
        status: PipelineStatus.EMBEDDING_CHECK,
      });
      mockOrchestrator.ConfirmPipeline.mockResolvedValue(mockPipeline);

      const result = (await controller.ConfirmPipeline('p1')) as unknown as {
        id: string;
        status: string;
        scope: { semesterId: string };
      };

      expect(result.id).toBe('p1');
      expect(result.status).toBe(PipelineStatus.EMBEDDING_CHECK);
      expect(result.scope.semesterId).toBe('s1');
      expect(mockOrchestrator.ConfirmPipeline).toHaveBeenCalledWith('p1');
    });
  });

  describe('CancelPipeline', () => {
    it('should delegate to orchestrator and return mapped DTO', async () => {
      const mockPipeline = makeMockPipeline({
        status: PipelineStatus.CANCELLED,
      });
      mockOrchestrator.CancelPipeline.mockResolvedValue(mockPipeline);

      const result = (await controller.CancelPipeline('p1')) as unknown as {
        id: string;
        status: string;
        scope: { semesterId: string };
      };

      expect(result.id).toBe('p1');
      expect(result.status).toBe(PipelineStatus.CANCELLED);
      expect(result.scope.semesterId).toBe('s1');
      expect(mockOrchestrator.CancelPipeline).toHaveBeenCalledWith('p1');
    });
  });

  describe('GetPipelineStatus', () => {
    it('should return pipeline status response', async () => {
      const mockStatus = {
        id: 'p1',
        status: PipelineStatus.SENTIMENT_ANALYSIS,
        // TD-9 shape — paired IDs + display values
        scope: {
          semesterId: 's1',
          semesterCode: 'S2026',
          departmentId: null,
          departmentCode: null,
        },
        coverage: { totalEnrolled: 100, submissionCount: 50 },
        stages: {
          embeddings: {
            status: 'completed',
            progress: null,
            startedAt: null,
            completedAt: null,
          },
          sentiment: {
            status: 'processing',
            progress: { current: 10, total: 50 },
            startedAt: '2026-03-13T10:00:00.000Z',
            completedAt: null,
          },
          sentimentGate: {
            status: 'pending',
            progress: null,
            startedAt: null,
            completedAt: null,
            included: null,
            excluded: null,
          },
          topicModeling: {
            status: 'pending',
            progress: null,
            startedAt: null,
            completedAt: null,
          },
          recommendations: {
            status: 'pending',
            progress: null,
            startedAt: null,
            completedAt: null,
          },
        },
        retryable: false,
        updatedAt: '2026-03-13T12:00:00.000Z',
      };
      mockOrchestrator.GetPipelineStatus.mockResolvedValue(mockStatus);

      const result = await controller.GetPipelineStatus('p1');

      expect(result).toBe(mockStatus);
      expect(mockOrchestrator.GetPipelineStatus).toHaveBeenCalledWith('p1');
    });
  });

  describe('ListPipelines', () => {
    it('should delegate to orchestrator.ListPipelines and map to summary DTOs', async () => {
      const mockPipeline = makeMockPipeline({
        semester: { id: 's1', code: 'S2026' },
      });
      mockOrchestrator.ListPipelines.mockResolvedValue([mockPipeline]);

      const query = { semesterId: 's1' };
      const result = await controller.ListPipelines(query);

      expect(mockOrchestrator.ListPipelines).toHaveBeenCalledWith(query);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      const first = result[0] as unknown as {
        id: string;
        status: string;
        scope: { semesterId: string; semesterCode: string };
      };
      expect(first.id).toBe('p1');
      expect(first.status).toBe(PipelineStatus.AWAITING_CONFIRMATION);
      expect(first.scope.semesterId).toBe('s1');
      expect(first.scope.semesterCode).toBe('S2026');
    });
  });

  describe('GetRecommendations', () => {
    it('should delegate to orchestrator.GetRecommendations with correct id', async () => {
      const mockResponse = {
        pipelineId: 'p1',
        runId: 'r1',
        status: 'COMPLETED',
        actions: [],
        completedAt: '2026-03-17T00:00:00.000Z',
      };
      mockOrchestrator.GetRecommendations.mockResolvedValue(mockResponse);

      const result = await controller.GetRecommendations('p1');

      expect(result).toBe(mockResponse);
      expect(mockOrchestrator.GetRecommendations).toHaveBeenCalledWith('p1');
    });
  });
});
