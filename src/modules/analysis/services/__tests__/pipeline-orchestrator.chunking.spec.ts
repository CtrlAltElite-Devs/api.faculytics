/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { PipelineOrchestratorService } from '../pipeline-orchestrator.service';
import { QueueName } from 'src/configurations/common/queue-names';
import { env } from 'src/configurations/env';
import { RunStatus, PipelineStatus } from '../../enums';
import { SentimentRun } from 'src/entities/sentiment-run.entity';

type DispatchCtx = {
  orchestrator: PipelineOrchestratorService;
  queueAdd: jest.Mock;
  failPipeline: jest.Mock;
  emCreate: jest.Mock;
  emFlush: jest.Mock;
  emFind: jest.Mock;
  readConfig: jest.Mock;
};

function buildOrchestrator(
  findResult: Array<{ id: string; cleanedComment: string | null }>,
  vllmConfig: { url: string; model: string; enabled: boolean } = {
    url: '',
    model: '',
    enabled: false,
  },
): DispatchCtx {
  const emCreate = jest
    .fn()
    .mockImplementation((_entity: unknown, data: Record<string, unknown>) => ({
      ...data,
      id: 'run-1',
    }));
  const emFlush = jest.fn().mockResolvedValue(undefined);
  const emFind = jest.fn().mockResolvedValue(findResult);
  const queueAdd = jest.fn().mockResolvedValue(undefined);
  const failPipeline = jest.fn().mockResolvedValue(undefined);
  const readConfig = jest.fn().mockResolvedValue(vllmConfig);

  const orchestrator = Object.create(
    PipelineOrchestratorService.prototype as object,
  ) as PipelineOrchestratorService;

  Object.defineProperty(orchestrator, 'sentimentQueue', {
    value: { add: queueAdd },
  });
  Object.defineProperty(orchestrator, 'logger', {
    value: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
  });
  Object.defineProperty(orchestrator, 'failPipeline', {
    value: failPipeline,
  });
  Object.defineProperty(orchestrator, 'sentimentConfigService', {
    value: { readConfig },
  });

  return {
    orchestrator,
    queueAdd,
    failPipeline,
    emCreate,
    emFlush,
    emFind,
    readConfig,
  };
}

function fakeEm(ctx: DispatchCtx) {
  return {
    find: ctx.emFind,
    create: ctx.emCreate,
    flush: ctx.emFlush,
  };
}

const fakePipeline = () => ({
  id: 'p1',
  status: PipelineStatus.SENTIMENT_ANALYSIS,
  semester: { id: 'sem-1' },
  faculty: undefined,
  questionnaireVersion: undefined,
  department: undefined,
  campus: undefined,
  program: undefined,
  course: undefined,
});

const dispatch = (
  orchestrator: PipelineOrchestratorService,
  em: unknown,
  pipeline: unknown,
) => {
  const proto = orchestrator as unknown as {
    dispatchSentiment(em: unknown, pipeline: unknown): Promise<void>;
  };
  return proto.dispatchSentiment(em, pipeline);
};

describe('PipelineOrchestratorService.dispatchSentiment (chunking)', () => {
  it('splits 785 submissions into 16 chunks and enqueues 16 jobs with padded jobIds', async () => {
    const submissions = Array.from({ length: 785 }, (_, i) => ({
      id: `s${i}`,
      cleanedComment: `comment ${i}`,
    }));
    const ctx = buildOrchestrator(submissions);

    const chunkSize = env.SENTIMENT_CHUNK_SIZE;
    expect(chunkSize).toBe(50);

    await dispatch(ctx.orchestrator, fakeEm(ctx), fakePipeline());

    expect(ctx.emCreate).toHaveBeenCalledTimes(1);
    const createArgs = ctx.emCreate.mock.calls[0];
    expect(createArgs[0]).toBe(SentimentRun);
    expect(createArgs[1]).toMatchObject({
      submissionCount: 785,
      expectedChunks: 16,
      completedChunks: 0,
      status: RunStatus.PROCESSING,
      jobId: 'p1--sentiment',
    });

    expect(ctx.queueAdd).toHaveBeenCalledTimes(16);
    const jobIds = ctx.queueAdd.mock.calls.map(
      (call) => (call[2] as { jobId: string }).jobId,
    );
    expect(jobIds[0]).toBe('p1--sentiment--0000');
    expect(jobIds[15]).toBe('p1--sentiment--0015');

    const firstCall = ctx.queueAdd.mock.calls[0];
    expect(firstCall[0]).toBe(QueueName.SENTIMENT);
    const firstEnvelope = firstCall[1];
    expect(firstEnvelope.metadata).toMatchObject({
      pipelineId: 'p1',
      runId: 'run-1',
      chunkIndex: 0,
      chunkCount: 16,
    });
    expect(firstEnvelope.items).toHaveLength(50);
    const lastCall = ctx.queueAdd.mock.calls[15];
    const lastEnvelope = lastCall[1];
    expect(lastEnvelope.metadata.chunkIndex).toBe(15);
    expect(lastEnvelope.items).toHaveLength(35);

    expect(ctx.failPipeline).not.toHaveBeenCalled();
  });

  it('produces a single chunk with --0000 suffix when submissions fit in one chunk', async () => {
    const submissions = Array.from({ length: 40 }, (_, i) => ({
      id: `s${i}`,
      cleanedComment: `c${i}`,
    }));
    const ctx = buildOrchestrator(submissions);

    await dispatch(ctx.orchestrator, fakeEm(ctx), fakePipeline());

    expect(ctx.emCreate.mock.calls[0][1]).toMatchObject({ expectedChunks: 1 });
    expect(ctx.queueAdd).toHaveBeenCalledTimes(1);
    expect(ctx.queueAdd.mock.calls[0][2].jobId).toBe('p1--sentiment--0000');
    const envelope = ctx.queueAdd.mock.calls[0][1];
    expect(envelope.metadata.chunkIndex).toBe(0);
    expect(envelope.metadata.chunkCount).toBe(1);
    expect(envelope.items).toHaveLength(40);
  });

  it('fails the pipeline and enqueues nothing when there are zero submissions', async () => {
    const ctx = buildOrchestrator([]);

    await dispatch(ctx.orchestrator, fakeEm(ctx), fakePipeline());

    expect(ctx.queueAdd).not.toHaveBeenCalled();
    expect(ctx.emCreate).not.toHaveBeenCalled();
    expect(ctx.failPipeline).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: 'p1' }),
      'No submissions with cleaned comments found for sentiment analysis',
    );
  });

  describe('vllmConfig injection', () => {
    it('injects vllmConfig on every chunk envelope when enabled + url present', async () => {
      const submissions = Array.from({ length: 120 }, (_, i) => ({
        id: `s${i}`,
        cleanedComment: `c${i}`,
      }));
      const ctx = buildOrchestrator(submissions, {
        url: 'https://vllm.example',
        model: 'gemma',
        enabled: true,
      });

      await dispatch(ctx.orchestrator, fakeEm(ctx), fakePipeline());

      expect(ctx.queueAdd).toHaveBeenCalledTimes(
        Math.ceil(120 / env.SENTIMENT_CHUNK_SIZE),
      );
      for (const call of ctx.queueAdd.mock.calls) {
        const envelope = call[1];
        expect(envelope.vllmConfig).toEqual({
          url: 'https://vllm.example',
          model: 'gemma',
          enabled: true,
        });
      }
    });

    it('omits vllmConfig when enabled=false', async () => {
      const submissions = Array.from({ length: 10 }, (_, i) => ({
        id: `s${i}`,
        cleanedComment: `c${i}`,
      }));
      const ctx = buildOrchestrator(submissions, {
        url: 'https://vllm.example',
        model: 'gemma',
        enabled: false,
      });

      await dispatch(ctx.orchestrator, fakeEm(ctx), fakePipeline());

      for (const call of ctx.queueAdd.mock.calls) {
        expect(call[1].vllmConfig).toBeUndefined();
      }
    });

    it('omits vllmConfig when url is empty even if enabled=true', async () => {
      const submissions = Array.from({ length: 10 }, (_, i) => ({
        id: `s${i}`,
        cleanedComment: `c${i}`,
      }));
      const ctx = buildOrchestrator(submissions, {
        url: '',
        model: 'gemma',
        enabled: true,
      });

      await dispatch(ctx.orchestrator, fakeEm(ctx), fakePipeline());

      for (const call of ctx.queueAdd.mock.calls) {
        expect(call[1].vllmConfig).toBeUndefined();
      }
    });

    it('reads the vllm config ONCE per dispatch, not per chunk', async () => {
      const submissions = Array.from({ length: 200 }, (_, i) => ({
        id: `s${i}`,
        cleanedComment: `c${i}`,
      }));
      const ctx = buildOrchestrator(submissions, {
        url: 'https://v',
        model: 'gemma',
        enabled: true,
      });

      await dispatch(ctx.orchestrator, fakeEm(ctx), fakePipeline());

      expect(ctx.readConfig).toHaveBeenCalledTimes(1);
    });
  });
});
