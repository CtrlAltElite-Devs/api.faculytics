import { Test, TestingModule } from '@nestjs/testing';
import { AnalysisController } from './analysis.controller';
import { PipelineOrchestratorService } from './services/pipeline-orchestrator.service';
import { PipelineStatus } from './enums';

const makeMockPipeline = (
  overrides: Partial<Record<string, unknown>> = {},
) => ({
  id: 'p1',
  status: PipelineStatus.AWAITING_CONFIRMATION,
  semester: { id: 's1' },
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
  confirmedAt: undefined,
  completedAt: undefined,
  ...overrides,
});

describe('AnalysisController', () => {
  let controller: AnalysisController;
  let mockOrchestrator: {
    CreatePipeline: jest.Mock;
    ConfirmPipeline: jest.Mock;
    CancelPipeline: jest.Mock;
    GetPipelineStatus: jest.Mock;
    GetRecommendations: jest.Mock;
  };

  beforeEach(async () => {
    mockOrchestrator = {
      CreatePipeline: jest.fn(),
      ConfirmPipeline: jest.fn(),
      CancelPipeline: jest.fn(),
      GetPipelineStatus: jest.fn(),
      GetRecommendations: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalysisController],
      providers: [
        {
          provide: PipelineOrchestratorService,
          useValue: mockOrchestrator,
        },
      ],
    }).compile();

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

      const result = await controller.CreatePipeline(body, req);

      expect(result).toEqual(
        expect.objectContaining({
          id: 'p1',
          status: PipelineStatus.AWAITING_CONFIRMATION,
          semesterId: 's1',
          triggeredById: 'u1',
          responseRate: 0.5,
        }),
      );
      expect(mockOrchestrator.CreatePipeline).toHaveBeenCalledWith(body, 'u1');
    });
  });

  describe('ConfirmPipeline', () => {
    it('should delegate to orchestrator and return mapped DTO', async () => {
      const mockPipeline = makeMockPipeline({
        status: PipelineStatus.EMBEDDING_CHECK,
      });
      mockOrchestrator.ConfirmPipeline.mockResolvedValue(mockPipeline);

      const result = await controller.ConfirmPipeline('p1');

      expect(result).toEqual(
        expect.objectContaining({
          id: 'p1',
          status: PipelineStatus.EMBEDDING_CHECK,
          semesterId: 's1',
        }),
      );
      expect(mockOrchestrator.ConfirmPipeline).toHaveBeenCalledWith('p1');
    });
  });

  describe('CancelPipeline', () => {
    it('should delegate to orchestrator and return mapped DTO', async () => {
      const mockPipeline = makeMockPipeline({
        status: PipelineStatus.CANCELLED,
      });
      mockOrchestrator.CancelPipeline.mockResolvedValue(mockPipeline);

      const result = await controller.CancelPipeline('p1');

      expect(result).toEqual(
        expect.objectContaining({
          id: 'p1',
          status: PipelineStatus.CANCELLED,
          semesterId: 's1',
        }),
      );
      expect(mockOrchestrator.CancelPipeline).toHaveBeenCalledWith('p1');
    });
  });

  describe('GetPipelineStatus', () => {
    it('should return pipeline status response', async () => {
      const mockStatus = {
        id: 'p1',
        status: PipelineStatus.SENTIMENT_ANALYSIS,
        scope: { semester: 'S2026' },
        coverage: { totalEnrolled: 100, submissionCount: 50 },
      };
      mockOrchestrator.GetPipelineStatus.mockResolvedValue(mockStatus);

      const result = await controller.GetPipelineStatus('p1');

      expect(result).toBe(mockStatus);
      expect(mockOrchestrator.GetPipelineStatus).toHaveBeenCalledWith('p1');
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
