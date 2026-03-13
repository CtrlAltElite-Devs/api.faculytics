import { Test, TestingModule } from '@nestjs/testing';
import { AnalysisController } from './analysis.controller';
import { PipelineOrchestratorService } from './services/pipeline-orchestrator.service';
import { PipelineStatus } from './enums';

describe('AnalysisController', () => {
  let controller: AnalysisController;
  let mockOrchestrator: {
    CreatePipeline: jest.Mock;
    ConfirmPipeline: jest.Mock;
    CancelPipeline: jest.Mock;
    GetPipelineStatus: jest.Mock;
  };

  beforeEach(async () => {
    mockOrchestrator = {
      CreatePipeline: jest.fn(),
      ConfirmPipeline: jest.fn(),
      CancelPipeline: jest.fn(),
      GetPipelineStatus: jest.fn(),
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
    it('should delegate to orchestrator with userId', async () => {
      const mockPipeline = {
        id: 'p1',
        status: PipelineStatus.AWAITING_CONFIRMATION,
      };
      mockOrchestrator.CreatePipeline.mockResolvedValue(mockPipeline);

      const body = { semesterId: 's1' };
      const req = {
        user: { userId: 'u1', moodleUserId: 1 },
      } as unknown as Parameters<typeof controller.CreatePipeline>[1];

      const result = await controller.CreatePipeline(body, req);

      expect(result).toBe(mockPipeline);
      expect(mockOrchestrator.CreatePipeline).toHaveBeenCalledWith(body, 'u1');
    });
  });

  describe('ConfirmPipeline', () => {
    it('should delegate to orchestrator', async () => {
      const mockPipeline = { id: 'p1', status: PipelineStatus.EMBEDDING_CHECK };
      mockOrchestrator.ConfirmPipeline.mockResolvedValue(mockPipeline);

      const result = await controller.ConfirmPipeline('p1');

      expect(result).toBe(mockPipeline);
      expect(mockOrchestrator.ConfirmPipeline).toHaveBeenCalledWith('p1');
    });
  });

  describe('CancelPipeline', () => {
    it('should delegate to orchestrator', async () => {
      const mockPipeline = { id: 'p1', status: PipelineStatus.CANCELLED };
      mockOrchestrator.CancelPipeline.mockResolvedValue(mockPipeline);

      const result = await controller.CancelPipeline('p1');

      expect(result).toBe(mockPipeline);
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
});
