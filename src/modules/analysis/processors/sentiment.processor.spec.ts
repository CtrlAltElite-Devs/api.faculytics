/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */

import { Test, TestingModule } from '@nestjs/testing';
import { EntityManager } from '@mikro-orm/postgresql';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { SentimentProcessor } from './sentiment.processor';
import { PipelineOrchestratorService } from '../services/pipeline-orchestrator.service';
import { env } from 'src/configurations/env';
import { BatchAnalysisJobMessage } from '../dto/batch-analysis-job-message.dto';
import { BatchAnalysisResultMessage } from '../dto/batch-analysis-result-message.dto';
import { Job } from 'bullmq';
import { QueueName } from 'src/configurations/common/queue-names';
import { RunStatus, PipelineStatus } from '../enums';
import { AnalysisPipeline } from 'src/entities/analysis-pipeline.entity';
import { SentimentRun } from 'src/entities/sentiment-run.entity';

const createMockBatchJob = (
  overrides?: Partial<BatchAnalysisJobMessage>,
  jobOverrides?: Partial<{ attemptsMade: number; opts: { attempts: number } }>,
): Job<BatchAnalysisJobMessage> =>
  ({
    id: 'pipeline1--sentiment--0000',
    queueName: QueueName.SENTIMENT,
    attemptsMade: jobOverrides?.attemptsMade ?? 1,
    opts: jobOverrides?.opts ?? { attempts: 3 },
    processedOn: 1_700_000_000_000,
    data: {
      jobId: '550e8400-e29b-41d4-a716-446655440000',
      version: '1.0',
      type: QueueName.SENTIMENT,
      items: [
        { submissionId: 's1', text: 'Great professor' },
        { submissionId: 's2', text: 'Too fast' },
      ],
      metadata: {
        pipelineId: 'p1',
        runId: 'r1',
        chunkIndex: 0,
        chunkCount: 1,
      },
      publishedAt: '2026-03-12T00:00:00.000Z',
      ...overrides,
    },
  }) as unknown as Job<BatchAnalysisJobMessage>;

const buildResult = (
  overrides?: Partial<BatchAnalysisResultMessage>,
): BatchAnalysisResultMessage => ({
  jobId: '550e8400-e29b-41d4-a716-446655440000',
  version: '1.0',
  status: 'completed',
  results: [
    { submissionId: 's1', positive: 0.85, neutral: 0.1, negative: 0.05 },
    { submissionId: 's2', positive: 0.05, neutral: 0.15, negative: 0.8 },
  ],
  completedAt: '2026-03-12T00:01:00.000Z',
  ...overrides,
});

type AnyFork = {
  findOne: jest.Mock;
  findOneOrFail: jest.Mock;
  flush: jest.Mock;
  getReference: jest.Mock;
  create: jest.Mock;
};

describe('SentimentProcessor', () => {
  let processor: SentimentProcessor;
  let mockEm: {
    fork: jest.Mock;
    transactional: jest.Mock;
  };
  let mockOrchestrator: {
    OnSentimentComplete: jest.Mock;
    OnStageFailed: jest.Mock;
  };
  let forks: AnyFork[];
  let tx: AnyFork & {
    getConnection: jest.Mock;
    getTransactionContext: jest.Mock;
  };
  let execute: jest.Mock;

  // Default fork behavior: pipeline lookup returns SENTIMENT_ANALYSIS,
  // run lookup returns a run without workerVersion, completion lookup
  // returns a PROCESSING run.
  const configureFork = (fork: AnyFork) => {
    fork.findOne.mockImplementation((entity: unknown) => {
      if (entity === AnalysisPipeline) {
        return Promise.resolve({
          id: 'p1',
          status: PipelineStatus.SENTIMENT_ANALYSIS,
        });
      }
      if (entity === SentimentRun) {
        return Promise.resolve({
          id: 'r1',
          workerVersion: null,
          completedChunks: 0,
          expectedChunks: 1,
          deletedAt: null,
        });
      }
      return Promise.resolve(null);
    });
    fork.findOneOrFail.mockImplementation((entity: unknown) => {
      if (entity === SentimentRun) {
        return Promise.resolve({
          id: 'r1',
          status: RunStatus.PROCESSING,
        });
      }
      return Promise.resolve({});
    });
  };

  const setPipelineStatus = (status: PipelineStatus) => {
    mockEm.fork.mockImplementationOnce(() => {
      const fork: AnyFork = {
        findOne: jest.fn().mockImplementation((entity: unknown) => {
          if (entity === AnalysisPipeline)
            return Promise.resolve({ id: 'p1', status });
          if (entity === SentimentRun)
            return Promise.resolve({
              id: 'r1',
              workerVersion: null,
              completedChunks: 0,
              expectedChunks: 1,
              deletedAt: null,
            });
          return Promise.resolve(null);
        }),
        findOneOrFail: jest.fn(),
        flush: jest.fn(),
        getReference: jest.fn(),
        create: jest.fn(),
      };
      forks.push(fork);
      return fork;
    });
  };

  const setCounter = (completed: number, expected: number) => {
    execute.mockResolvedValue([
      { completedChunks: completed, expectedChunks: expected },
    ]);
  };

  beforeEach(async () => {
    execute = jest
      .fn()
      .mockResolvedValue([{ completedChunks: 1, expectedChunks: 1 }]);

    tx = {
      getReference: jest.fn().mockImplementation((_entity, id) => ({ id })),
      create: jest
        .fn()
        .mockImplementation((_entity, data) => ({ ...data, id: 'new-id' })),
      flush: jest.fn(),
      findOne: jest.fn(),
      findOneOrFail: jest.fn().mockResolvedValue({
        id: 'r1',
        status: RunStatus.PROCESSING,
      }),
      getConnection: jest.fn().mockReturnValue({ execute }),
      getTransactionContext: jest.fn().mockReturnValue({ __tx: true }),
    };

    forks = [];
    mockEm = {
      fork: jest.fn().mockImplementation(() => {
        const fork: AnyFork = {
          findOne: jest.fn(),
          findOneOrFail: jest.fn(),
          flush: jest.fn(),
          getReference: jest.fn().mockImplementation((_entity, id) => ({ id })),
          create: jest.fn(),
        };
        configureFork(fork);
        forks.push(fork);
        return fork;
      }),
      transactional: jest
        .fn()
        .mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    };

    mockOrchestrator = {
      OnSentimentComplete: jest.fn().mockResolvedValue(undefined),
      OnStageFailed: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: SentimentProcessor,
          useFactory: () =>
            new SentimentProcessor(
              mockEm as unknown as EntityManager,
              mockOrchestrator as unknown as PipelineOrchestratorService,
            ),
        },
      ],
    }).compile();

    processor = module.get<SentimentProcessor>(SentimentProcessor);
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  it('should return SENTIMENT_WORKER_URL from env', () => {
    expect(processor.GetWorkerUrl()).toBe(env.SENTIMENT_WORKER_URL);
  });

  describe('Persist — single-chunk happy path (backwards-compat)', () => {
    it('persists results, ticks counter, completes run, fires OnSentimentComplete', async () => {
      setCounter(1, 1);

      await processor.Persist(createMockBatchJob(), buildResult());

      expect(tx.create).toHaveBeenCalledTimes(2);
      expect(tx.flush).toHaveBeenCalled();
      expect(execute).toHaveBeenCalledTimes(1);
      // Last chunk: run-completion writes happen inside tx now.
      expect(tx.findOneOrFail).toHaveBeenCalledWith(SentimentRun, 'r1');
      expect(mockOrchestrator.OnSentimentComplete).toHaveBeenCalledWith('p1');
    });

    it('passes the transaction context to the counter UPDATE', async () => {
      setCounter(1, 1);
      await processor.Persist(createMockBatchJob(), buildResult());

      expect(execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE sentiment_run'),
        ['r1', 'p1'],
        'all',
        { __tx: true },
      );
    });

    it('treats legacy envelope without chunk metadata as 1/1', async () => {
      setCounter(1, 1);

      const job = createMockBatchJob({
        metadata: { pipelineId: 'p1', runId: 'r1' },
      });

      await processor.Persist(job, buildResult());

      expect(mockOrchestrator.OnSentimentComplete).toHaveBeenCalledWith('p1');
    });
  });

  describe('Persist — chunk completion semantics', () => {
    it('increments counter but does NOT fire OnSentimentComplete for non-last chunk', async () => {
      setCounter(1, 3);

      const job = createMockBatchJob({
        metadata: {
          pipelineId: 'p1',
          runId: 'r1',
          chunkIndex: 0,
          chunkCount: 3,
        },
      });

      const logSpy = jest
        .spyOn(processor['logger'], 'log')
        .mockImplementation();

      await processor.Persist(job, buildResult());

      expect(mockOrchestrator.OnSentimentComplete).not.toHaveBeenCalled();
      expect(tx.findOneOrFail).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'sentiment_chunk',
          status: 'persisted',
          lastChunk: false,
          chunkIndex: 0,
          chunkCount: 3,
        }),
      );
    });

    it('fires OnSentimentComplete exactly once on last chunk', async () => {
      setCounter(3, 3);

      const job = createMockBatchJob({
        metadata: {
          pipelineId: 'p1',
          runId: 'r1',
          chunkIndex: 2,
          chunkCount: 3,
        },
      });

      const logSpy = jest
        .spyOn(processor['logger'], 'log')
        .mockImplementation();

      await processor.Persist(job, buildResult());

      expect(mockOrchestrator.OnSentimentComplete).toHaveBeenCalledTimes(1);
      expect(mockOrchestrator.OnSentimentComplete).toHaveBeenCalledWith('p1');
      expect(tx.findOneOrFail).toHaveBeenCalledWith(SentimentRun, 'r1');
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'sentiment_chunk',
          status: 'persisted',
          lastChunk: true,
        }),
      );
    });
  });

  describe('Persist — servedBy round-trip (vLLM-primary feature)', () => {
    it('preserves servedBy inside rawResult JSONB when the worker supplies it', async () => {
      setCounter(1, 1);

      const result = buildResult({
        results: [
          {
            submissionId: 's1',
            positive: 1,
            neutral: 0,
            negative: 0,
            servedBy: 'vllm',
          } as unknown as BatchAnalysisResultMessage['results'][number],
          {
            submissionId: 's2',
            positive: 0.05,
            neutral: 0.15,
            negative: 0.8,
            servedBy: 'openai',
          } as unknown as BatchAnalysisResultMessage['results'][number],
        ],
      });

      await processor.Persist(createMockBatchJob(), result);

      const createCalls = tx.create.mock.calls as Array<
        [unknown, { rawResult: Record<string, unknown> }]
      >;
      expect(createCalls).toHaveLength(2);
      const rawOf = (idx: number) => createCalls[idx][1].rawResult;
      expect(rawOf(0)).toMatchObject({ servedBy: 'vllm', submissionId: 's1' });
      expect(rawOf(1)).toMatchObject({
        servedBy: 'openai',
        submissionId: 's2',
      });
    });

    it('does not error when the worker omits servedBy (backward compatibility)', async () => {
      setCounter(1, 1);

      await processor.Persist(createMockBatchJob(), buildResult());

      expect(tx.create).toHaveBeenCalledTimes(2);
      const createCalls = tx.create.mock.calls as Array<
        [unknown, { rawResult: Record<string, unknown> }]
      >;
      const rawOf = (idx: number) => createCalls[idx][1].rawResult;
      expect(rawOf(0).servedBy).toBeUndefined();
      expect(rawOf(1).servedBy).toBeUndefined();
    });
  });

  describe('Persist — idempotency and supersede', () => {
    it('swallows UniqueConstraintViolationException as duplicate-swallowed', async () => {
      tx.flush.mockRejectedValue(
        new UniqueConstraintViolationException(
          new Error('duplicate key value violates unique constraint'),
        ),
      );

      const logSpy = jest
        .spyOn(processor['logger'], 'log')
        .mockImplementation();

      await processor.Persist(createMockBatchJob(), buildResult());

      expect(execute).not.toHaveBeenCalled();
      expect(mockOrchestrator.OnSentimentComplete).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'sentiment_chunk',
          status: 'duplicate-swallowed',
        }),
      );
    });

    it('re-fires OnSentimentComplete on duplicate-swallowed when counter is already saturated', async () => {
      // Simulate the F2 scenario: prior tx committed the last chunk including
      // counter=expected, but OnSentimentComplete failed after; BullMQ retries
      // and the retry must compensate by re-firing OnSentimentComplete.
      tx.flush.mockRejectedValue(
        new UniqueConstraintViolationException(
          new Error('duplicate key value violates unique constraint'),
        ),
      );

      // The follow-up fork lookup after duplicate-swallowed returns a saturated run.
      const originalFork = mockEm.fork;
      let forkIndex = 0;
      mockEm.fork.mockImplementation(() => {
        const fork: AnyFork = {
          findOne: jest.fn(),
          findOneOrFail: jest.fn(),
          flush: jest.fn(),
          getReference: jest.fn().mockImplementation((_entity, id) => ({ id })),
          create: jest.fn(),
        };
        if (forkIndex === 0) {
          configureFork(fork);
        } else {
          // Second fork is for the duplicate-swallowed compensation check.
          fork.findOne.mockResolvedValue({
            id: 'r1',
            completedChunks: 3,
            expectedChunks: 3,
          });
        }
        forks.push(fork);
        forkIndex++;
        return fork;
      });

      const logSpy = jest
        .spyOn(processor['logger'], 'log')
        .mockImplementation();

      await processor.Persist(
        createMockBatchJob({
          metadata: {
            pipelineId: 'p1',
            runId: 'r1',
            chunkIndex: 2,
            chunkCount: 3,
          },
        }),
        buildResult(),
      );

      expect(mockOrchestrator.OnSentimentComplete).toHaveBeenCalledWith('p1');
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'duplicate-swallowed',
          lastChunk: true,
        }),
      );

      mockEm.fork = originalFork;
    });

    it('lets UniqueConstraintViolation propagate out of the transactional callback so MikroORM rolls back before translation', async () => {
      // Regression: catching 23505 inside the transactional callback and
      // returning normally tells MikroORM to COMMIT on top of an
      // already-aborted Postgres txn, which then fails with 25P02
      // ("current transaction is aborted, commands ignored until end of
      // transaction block"). The catch must live in the OUTER .catch() so
      // the rollback happens first.
      tx.flush.mockRejectedValue(
        new UniqueConstraintViolationException(
          new Error('duplicate key value violates unique constraint'),
        ),
      );

      let callbackRejected = false;
      mockEm.transactional.mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => {
          try {
            return await fn(tx);
          } catch (err) {
            callbackRejected = true;
            throw err;
          }
        },
      );

      const logSpy = jest
        .spyOn(processor['logger'], 'log')
        .mockImplementation();

      await processor.Persist(createMockBatchJob(), buildResult());

      expect(callbackRejected).toBe(true);
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'duplicate-swallowed' }),
      );
    });

    it('reports counter-saturated reason when UPDATE matches zero rows and run is saturated', async () => {
      execute.mockResolvedValue([]);

      // Configure the discriminator fork (2nd fork) to see a saturated run.
      let forkIndex = 0;
      mockEm.fork.mockImplementation(() => {
        const fork: AnyFork = {
          findOne: jest.fn(),
          findOneOrFail: jest.fn(),
          flush: jest.fn(),
          getReference: jest.fn().mockImplementation((_entity, id) => ({ id })),
          create: jest.fn(),
        };
        if (forkIndex === 0) {
          configureFork(fork);
        } else {
          fork.findOne.mockImplementation((entity: unknown, where: unknown) => {
            if (entity === SentimentRun && typeof where === 'string') {
              return Promise.resolve({
                id: 'r1',
                completedChunks: 3,
                expectedChunks: 3,
                deletedAt: null,
              });
            }
            return Promise.resolve(null);
          });
        }
        forks.push(fork);
        forkIndex++;
        return fork;
      });

      const warnSpy = jest
        .spyOn(processor['logger'], 'warn')
        .mockImplementation();

      await processor.Persist(
        createMockBatchJob({
          metadata: {
            pipelineId: 'p1',
            runId: 'r1',
            chunkIndex: 2,
            chunkCount: 3,
          },
        }),
        buildResult(),
      );

      expect(mockOrchestrator.OnSentimentComplete).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'sentiment_chunk',
          status: 'superseded',
          reason: 'counter-saturated',
        }),
      );
    });

    it('short-circuits with pipeline-missing when pipeline is soft-deleted / missing', async () => {
      // Override the first fork's pipeline lookup to return null.
      mockEm.fork.mockImplementationOnce(() => {
        const fork: AnyFork = {
          findOne: jest
            .fn()
            .mockImplementation((entity: unknown) =>
              entity === AnalysisPipeline
                ? Promise.resolve(null)
                : Promise.resolve(null),
            ),
          findOneOrFail: jest.fn(),
          flush: jest.fn(),
          getReference: jest.fn(),
          create: jest.fn(),
        };
        forks.push(fork);
        return fork;
      });

      const warnSpy = jest
        .spyOn(processor['logger'], 'warn')
        .mockImplementation();

      await processor.Persist(createMockBatchJob(), buildResult());

      expect(mockEm.transactional).not.toHaveBeenCalled();
      expect(mockOrchestrator.OnStageFailed).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'superseded',
          reason: 'pipeline-missing',
        }),
      );
    });

    it('short-circuits with superseded when pipeline is in terminal state (FAILED)', async () => {
      setPipelineStatus(PipelineStatus.FAILED);

      const warnSpy = jest
        .spyOn(processor['logger'], 'warn')
        .mockImplementation();

      await processor.Persist(createMockBatchJob(), buildResult());

      expect(mockEm.transactional).not.toHaveBeenCalled();
      expect(tx.create).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
      expect(mockOrchestrator.OnSentimentComplete).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'sentiment_chunk',
          status: 'superseded',
          reason: 'pipeline-terminal',
        }),
      );
    });

    it('short-circuits with superseded when pipeline is CANCELLED', async () => {
      setPipelineStatus(PipelineStatus.CANCELLED);

      const warnSpy = jest
        .spyOn(processor['logger'], 'warn')
        .mockImplementation();

      await processor.Persist(createMockBatchJob(), buildResult());

      expect(mockEm.transactional).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'superseded',
          reason: 'pipeline-terminal',
        }),
      );
    });

    it('short-circuits with superseded when pipeline is COMPLETED', async () => {
      setPipelineStatus(PipelineStatus.COMPLETED);

      const warnSpy = jest
        .spyOn(processor['logger'], 'warn')
        .mockImplementation();

      await processor.Persist(createMockBatchJob(), buildResult());

      expect(mockEm.transactional).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'superseded',
          reason: 'pipeline-terminal',
        }),
      );
    });

    it('short-circuits with run-missing-or-mismatched when runId belongs to a different pipeline', async () => {
      mockEm.fork.mockImplementationOnce(() => {
        const fork: AnyFork = {
          findOne: jest.fn().mockImplementation((entity: unknown) => {
            if (entity === AnalysisPipeline)
              return Promise.resolve({
                id: 'p1',
                status: PipelineStatus.SENTIMENT_ANALYSIS,
              });
            if (entity === SentimentRun) return Promise.resolve(null);
            return Promise.resolve(null);
          }),
          findOneOrFail: jest.fn(),
          flush: jest.fn(),
          getReference: jest.fn(),
          create: jest.fn(),
        };
        forks.push(fork);
        return fork;
      });

      const warnSpy = jest
        .spyOn(processor['logger'], 'warn')
        .mockImplementation();

      await processor.Persist(createMockBatchJob(), buildResult());

      expect(mockEm.transactional).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'superseded',
          reason: 'run-missing-or-mismatched',
        }),
      );
    });
  });

  describe('Persist — transactional rollback', () => {
    it('rolls back and rethrows a non-unique error mid-transaction', async () => {
      const fkErr = new Error('FK violation');
      tx.flush.mockRejectedValue(fkErr);

      await expect(
        processor.Persist(createMockBatchJob(), buildResult()),
      ).rejects.toThrow('FK violation');
      expect(execute).not.toHaveBeenCalled();
      expect(mockOrchestrator.OnSentimentComplete).not.toHaveBeenCalled();
    });
  });

  describe('Persist — worker-level failure paths', () => {
    it('calls OnStageFailed with chunk-aware message when worker returns failed', async () => {
      const job = createMockBatchJob({
        metadata: {
          pipelineId: 'p1',
          runId: 'r1',
          chunkIndex: 3,
          chunkCount: 16,
        },
      });
      const result: BatchAnalysisResultMessage = buildResult({
        status: 'failed',
        results: undefined,
        error: 'CUDA out of memory',
      });

      const warnSpy = jest
        .spyOn(processor['logger'], 'warn')
        .mockImplementation();

      await processor.Persist(job, result);

      expect(mockOrchestrator.OnStageFailed).toHaveBeenCalledWith(
        'p1',
        'sentiment_analysis',
        expect.stringMatching(
          /^chunk 4\/16 failed after 1 retries: CUDA out of memory$/,
        ),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          reason: 'CUDA out of memory',
        }),
      );
    });

    it('calls OnStageFailed when worker returns empty results', async () => {
      const warnSpy = jest
        .spyOn(processor['logger'], 'warn')
        .mockImplementation();

      await processor.Persist(
        createMockBatchJob(),
        buildResult({ results: [] }),
      );

      expect(mockOrchestrator.OnStageFailed).toHaveBeenCalledWith(
        'p1',
        'sentiment_analysis',
        expect.stringContaining('returned no results from worker'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', reason: 'no-results' }),
      );
    });

    it('calls OnStageFailed when all submissionIds are unknown', async () => {
      const warnSpy = jest
        .spyOn(processor['logger'], 'warn')
        .mockImplementation();

      const result = buildResult({
        results: [
          { submissionId: 'bad-1', positive: 0.8, neutral: 0.1, negative: 0.1 },
          { submissionId: 'bad-2', positive: 0.1, neutral: 0.1, negative: 0.8 },
        ],
      });

      await processor.Persist(createMockBatchJob(), result);

      expect(mockOrchestrator.OnStageFailed).toHaveBeenCalledWith(
        'p1',
        'sentiment_analysis',
        expect.stringContaining('no valid results (all submissionIds unknown)'),
      );
      expect(mockEm.transactional).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'failed', reason: 'all-dropped' }),
      );
    });

    it('drops unknown submissionIds but persists the valid majority', async () => {
      setCounter(1, 1);
      const warnSpy = jest
        .spyOn(processor['logger'], 'warn')
        .mockImplementation();

      const result = buildResult({
        results: [
          { submissionId: 's1', positive: 0.8, neutral: 0.1, negative: 0.1 },
          { submissionId: 's2', positive: 0.1, neutral: 0.1, negative: 0.8 },
          {
            submissionId: 'unknown',
            positive: 0.5,
            neutral: 0.3,
            negative: 0.2,
          },
        ],
      });

      await processor.Persist(createMockBatchJob(), result);

      expect(tx.create).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Dropped 1 of 3'),
      );
    });
  });

  describe('Persist — worker-version drift', () => {
    it('emits worker_version_drift warn when prior run had a different version', async () => {
      setCounter(1, 1);
      mockEm.fork.mockImplementationOnce(() => {
        const fork: AnyFork = {
          findOne: jest.fn().mockImplementation((entity: unknown) => {
            if (entity === AnalysisPipeline)
              return Promise.resolve({
                id: 'p1',
                status: PipelineStatus.SENTIMENT_ANALYSIS,
              });
            if (entity === SentimentRun)
              return Promise.resolve({
                id: 'r1',
                workerVersion: '1.0.0-openai',
              });
            return Promise.resolve(null);
          }),
          findOneOrFail: jest.fn(),
          flush: jest.fn(),
          getReference: jest.fn(),
          create: jest.fn(),
        };
        forks.push(fork);
        return fork;
      });
      const warnSpy = jest
        .spyOn(processor['logger'], 'warn')
        .mockImplementation();

      await processor.Persist(
        createMockBatchJob(),
        buildResult({ version: '1.0.1-openai' }),
      );

      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'sentiment_worker_version_drift',
          priorVersion: '1.0.0-openai',
          chunkVersion: '1.0.1-openai',
        }),
      );
    });
  });

  describe('onFailed', () => {
    it('produces chunk-aware message and emits failed chunk-log on terminal failure', () => {
      const job = createMockBatchJob(
        {
          metadata: {
            pipelineId: 'p1',
            runId: 'r1',
            chunkIndex: 4,
            chunkCount: 16,
          },
        },
        { attemptsMade: 3, opts: { attempts: 3 } },
      );

      const warnSpy = jest
        .spyOn(processor['logger'], 'warn')
        .mockImplementation();

      processor.onFailed(job, new Error('boom'));

      expect(mockOrchestrator.OnStageFailed).toHaveBeenCalledWith(
        'p1',
        'sentiment_analysis',
        expect.stringMatching(/^chunk 5\/16 failed after 3 retries: boom$/),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'sentiment_chunk',
          status: 'failed',
          reason: 'boom',
        }),
      );
    });

    it('skips OnStageFailed before attempts are exhausted', () => {
      const job = createMockBatchJob(undefined, {
        attemptsMade: 1,
        opts: { attempts: 3 },
      });

      processor.onFailed(job, new Error('transient'));

      expect(mockOrchestrator.OnStageFailed).not.toHaveBeenCalled();
    });

    it('logs malformed envelope error and does NOT call OnStageFailed', () => {
      const job = {
        ...createMockBatchJob(),
        data: { metadata: {} },
      } as unknown as Job<BatchAnalysisJobMessage>;

      const errSpy = jest
        .spyOn(processor['logger'], 'error')
        .mockImplementation();

      processor.onFailed(job, new Error('bad envelope'));

      expect(errSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'sentiment_chunk_malformed_envelope',
          reason: 'bad envelope',
        }),
      );
      expect(mockOrchestrator.OnStageFailed).not.toHaveBeenCalled();
    });

    it('matches timeout underlying error in the fail-fast message', () => {
      const job = createMockBatchJob(
        {
          metadata: {
            pipelineId: 'p1',
            runId: 'r1',
            chunkIndex: 0,
            chunkCount: 2,
          },
        },
        { attemptsMade: 3, opts: { attempts: 3 } },
      );

      processor.onFailed(
        job,
        new Error('HTTP request to sentiment worker timed out after 90000ms'),
      );

      expect(mockOrchestrator.OnStageFailed).toHaveBeenCalledWith(
        'p1',
        'sentiment_analysis',
        expect.stringMatching(
          /^chunk 1\/2 failed after 3 retries: HTTP request to sentiment worker timed out/,
        ),
      );
    });
  });
});
