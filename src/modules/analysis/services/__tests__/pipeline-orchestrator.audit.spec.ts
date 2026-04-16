import { PipelineStatus, PipelineTrigger } from '../../enums';
import { PipelineOrchestratorService } from '../pipeline-orchestrator.service';
import { AuditAction } from 'src/modules/audit/audit-action.enum';
import type { AnalysisPipeline } from 'src/entities/analysis-pipeline.entity';
import type { EmitParams } from 'src/modules/audit/dto/emit-params.dto';

/**
 * Covers the audit-emit path added for pipeline failures.
 * Three surfaces under test:
 *   - `OnStageFailed` (public) — guarded by TERMINAL_STATUSES, emits once.
 *   - `emitPipelineFailAudit` (private) — metadata shape + scope inclusion.
 *   - `failPipeline` (private) — "<stage>: <message>" prefix parsing.
 */

interface TestPipeline {
  id: string;
  status: PipelineStatus;
  trigger: PipelineTrigger;
  totalEnrolled: number;
  submissionCount: number;
  commentCount: number;
  responseRate: number | string;
  errorMessage?: string;
  semester: { id: string };
  triggeredBy?: { id: string };
  faculty?: { id: string };
  department?: { id: string };
  program?: { id: string };
  campus?: { id: string };
  course?: { id: string };
  questionnaireVersion?: { id: string };
}

function buildPipeline(overrides: Partial<TestPipeline> = {}): TestPipeline {
  return {
    id: 'pipeline-1',
    status: PipelineStatus.SENTIMENT_ANALYSIS,
    trigger: PipelineTrigger.USER,
    totalEnrolled: 1033,
    submissionCount: 856,
    commentCount: 849,
    responseRate: '0.8287',
    semester: { id: 'sem-1' },
    triggeredBy: { id: 'user-1' },
    campus: { id: 'campus-1' },
    ...overrides,
  };
}

type EmitMock = jest.Mock<Promise<void>, [EmitParams]>;

interface OrchestratorInternals {
  OnStageFailed(
    pipelineId: string,
    stage: string,
    error: string,
  ): Promise<void>;
  emitPipelineFailAudit(
    pipeline: AnalysisPipeline,
    stage: string,
    errorMessage: string,
  ): void;
  failPipeline(
    em: { flush: () => Promise<void> },
    pipeline: AnalysisPipeline,
    error: string,
  ): Promise<void>;
}

function makeService(overrides: {
  findOne?: jest.Mock;
  flush?: jest.Mock;
  emit?: EmitMock;
}): {
  service: OrchestratorInternals;
  emit: EmitMock;
  flush: jest.Mock;
  findOne: jest.Mock;
} {
  const findOne = overrides.findOne ?? jest.fn();
  const flush = overrides.flush ?? jest.fn().mockResolvedValue(undefined);
  const emit: EmitMock =
    overrides.emit ?? (jest.fn().mockResolvedValue(undefined) as EmitMock);

  const fork = { findOne, flush };
  const em = { fork: () => fork };
  const auditService = { Emit: emit };

  const Ctor = PipelineOrchestratorService as unknown as new (
    ...args: unknown[]
  ) => object;
  const instance = new Ctor(
    em,
    {},
    {},
    {},
    {},
    {},
    {},
    auditService,
    {},
    {},
    {},
    {},
  );
  const service = instance as unknown as OrchestratorInternals;

  return { service, emit, flush, findOne };
}

function firstEmitCall(emit: EmitMock): EmitParams {
  expect(emit).toHaveBeenCalledTimes(1);
  return emit.mock.calls[0][0];
}

describe('PipelineOrchestratorService — pipeline failure audit', () => {
  describe('OnStageFailed', () => {
    it('emits ANALYSIS_PIPELINE_FAIL with stage + errorMessage + scope metadata', async () => {
      const pipeline = buildPipeline();
      const { service, emit, flush, findOne } = makeService({
        findOne: jest.fn().mockResolvedValue(pipeline),
      });

      await service.OnStageFailed(
        pipeline.id,
        'sentiment_analysis',
        'HTTP 413',
      );

      expect(flush).toHaveBeenCalledTimes(1);
      expect(pipeline.status).toBe(PipelineStatus.FAILED);
      expect(pipeline.errorMessage).toBe('sentiment_analysis: HTTP 413');
      expect(findOne).toHaveBeenCalledWith(expect.anything(), pipeline.id);

      const call = firstEmitCall(emit);
      expect(call.action).toBe(AuditAction.ANALYSIS_PIPELINE_FAIL);
      expect(call.actorId).toBe('user-1');
      expect(call.resourceType).toBe('analysis_pipeline');
      expect(call.resourceId).toBe('pipeline-1');
      expect(call.metadata).toEqual({
        stage: 'sentiment_analysis',
        errorMessage: 'HTTP 413',
        trigger: PipelineTrigger.USER,
        totalEnrolled: 1033,
        submissionCount: 856,
        commentCount: 849,
        responseRate: 0.8287,
        semesterId: 'sem-1',
        campusId: 'campus-1',
      });
    });

    it('does not emit when pipeline is already in a terminal status', async () => {
      const pipeline = buildPipeline({ status: PipelineStatus.COMPLETED });
      const { service, emit, flush } = makeService({
        findOne: jest.fn().mockResolvedValue(pipeline),
      });

      await service.OnStageFailed(pipeline.id, 'sentiment_analysis', 'late');

      expect(flush).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it('does not emit when pipeline is not found', async () => {
      const { service, emit } = makeService({
        findOne: jest.fn().mockResolvedValue(null),
      });

      await service.OnStageFailed('missing', 'sentiment_analysis', 'err');

      expect(emit).not.toHaveBeenCalled();
    });
  });

  describe('emitPipelineFailAudit (private)', () => {
    it('includes every populated scope relation id in metadata', () => {
      const pipeline = buildPipeline({
        faculty: { id: 'fac-1' },
        department: { id: 'dept-1' },
        program: { id: 'prog-1' },
        campus: { id: 'campus-1' },
        course: { id: 'course-1' },
        questionnaireVersion: { id: 'qv-1' },
      });
      const { service, emit } = makeService({});

      service.emitPipelineFailAudit(
        pipeline as unknown as AnalysisPipeline,
        'topic_modeling',
        'boom',
      );

      const metadata = firstEmitCall(emit).metadata!;
      expect(metadata.facultyId).toBe('fac-1');
      expect(metadata.departmentId).toBe('dept-1');
      expect(metadata.programId).toBe('prog-1');
      expect(metadata.campusId).toBe('campus-1');
      expect(metadata.courseId).toBe('course-1');
      expect(metadata.questionnaireVersionId).toBe('qv-1');
    });

    it('omits scope keys that are not set on the pipeline', () => {
      const pipeline = buildPipeline({
        campus: undefined,
        department: { id: 'dept-1' },
      });
      const { service, emit } = makeService({});

      service.emitPipelineFailAudit(
        pipeline as unknown as AnalysisPipeline,
        'sentiment_analysis',
        'err',
      );

      const metadata = firstEmitCall(emit).metadata!;
      expect(metadata).not.toHaveProperty('campusId');
      expect(metadata).not.toHaveProperty('facultyId');
      expect(metadata.departmentId).toBe('dept-1');
    });

    it('omits actorId when triggeredBy is absent', () => {
      const pipeline = buildPipeline({ triggeredBy: undefined });
      const { service, emit } = makeService({});

      service.emitPipelineFailAudit(
        pipeline as unknown as AnalysisPipeline,
        'sentiment_analysis',
        'err',
      );

      expect(firstEmitCall(emit).actorId).toBeUndefined();
    });
  });

  describe('failPipeline stage parsing (private)', () => {
    it('extracts stage from "<stage>: <message>" prefix', async () => {
      const pipeline = buildPipeline();
      const { service, emit } = makeService({});

      await service.failPipeline(
        { flush: jest.fn().mockResolvedValue(undefined) },
        pipeline as unknown as AnalysisPipeline,
        'sentiment_analysis: worker dropped all results',
      );

      const metadata = firstEmitCall(emit).metadata!;
      expect(metadata.stage).toBe('sentiment_analysis');
      expect(metadata.errorMessage).toBe('worker dropped all results');
    });

    it('falls back to stage="unknown" when error lacks a stage prefix', async () => {
      const pipeline = buildPipeline();
      const { service, emit } = makeService({});

      await service.failPipeline(
        { flush: jest.fn().mockResolvedValue(undefined) },
        pipeline as unknown as AnalysisPipeline,
        'No submissions with cleaned comments found',
      );

      const metadata = firstEmitCall(emit).metadata!;
      expect(metadata.stage).toBe('unknown');
      expect(metadata.errorMessage).toBe(
        'No submissions with cleaned comments found',
      );
    });
  });
});
