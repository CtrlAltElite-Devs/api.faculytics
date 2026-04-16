import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import { EntityManager } from '@mikro-orm/postgresql';
import { TieredPipelineSchedulerJob } from '../tiered-pipeline-scheduler.job';
import { PipelineOrchestratorService } from 'src/modules/analysis/services/pipeline-orchestrator.service';
import type { ActiveScopeForTier } from 'src/modules/analysis/services/pipeline-orchestrator.service';

type RepoMock = {
  FindChangedSince: jest.Mock;
};

function makeRepoMock(): RepoMock {
  return { FindChangedSince: jest.fn() };
}

function makeOrchestratorMock(scopes: ActiveScopeForTier[] = []) {
  return {
    FindActiveScopesForTier: jest.fn().mockResolvedValue(scopes),
    CreateAndConfirmPipeline: jest.fn().mockResolvedValue({ id: 'p1' }),
  };
}

function makeEmMock(repo: RepoMock, systemUser: { id: string } | null) {
  const fork = {
    findOne: jest.fn().mockResolvedValue(systemUser),
  };
  return {
    fork: jest.fn().mockReturnValue(fork),
    getRepository: jest.fn().mockReturnValue(repo),
  };
}

describe('TieredPipelineSchedulerJob', () => {
  let job: TieredPipelineSchedulerJob;
  let orchestrator: ReturnType<typeof makeOrchestratorMock>;
  let repo: RepoMock;
  let em: ReturnType<typeof makeEmMock>;

  async function buildModule(
    overrides: {
      scopes?: ActiveScopeForTier[];
      systemUser?: { id: string } | null;
    } = {},
  ): Promise<TestingModule> {
    orchestrator = makeOrchestratorMock(overrides.scopes ?? []);
    repo = makeRepoMock();
    em = makeEmMock(repo, overrides.systemUser ?? { id: 'system-1' });

    const module = await Test.createTestingModule({
      providers: [
        TieredPipelineSchedulerJob,
        { provide: PipelineOrchestratorService, useValue: orchestrator },
        { provide: EntityManager, useValue: em },
        { provide: SchedulerRegistry, useValue: new SchedulerRegistry() },
      ],
    }).compile();

    job = module.get(TieredPipelineSchedulerJob);
    return module;
  }

  it('skips when no active scopes for the tier', async () => {
    await buildModule({ scopes: [] });
    const result = await job.RunFacultyTier();
    expect(result.status).toBe('executed');
    expect(orchestrator.CreateAndConfirmPipeline).not.toHaveBeenCalled();
  });

  it('skips a scope when FindChangedSince returns zero (AC15)', async () => {
    await buildModule({
      scopes: [
        {
          scopeType: 'FACULTY',
          scopeId: 'fac-1',
          semesterId: 'sem-1',
          lastPipelineCompletedAt: new Date('2026-04-10T00:00:00Z'),
        },
      ],
    });
    repo.FindChangedSince.mockResolvedValueOnce({ ids: [], count: 0 });
    await job.RunFacultyTier();
    expect(repo.FindChangedSince).toHaveBeenCalledWith(
      { semester: 'sem-1', faculty: 'fac-1' },
      new Date('2026-04-10T00:00:00Z'),
    );
    expect(orchestrator.CreateAndConfirmPipeline).not.toHaveBeenCalled();
  });

  it('enqueues a pipeline when scope has new submissions (AC14)', async () => {
    await buildModule({
      scopes: [
        {
          scopeType: 'FACULTY',
          scopeId: 'fac-1',
          semesterId: 'sem-1',
          lastPipelineCompletedAt: null,
        },
      ],
    });
    repo.FindChangedSince.mockResolvedValueOnce({
      ids: ['sub-1', 'sub-2'],
      count: 2,
    });
    await job.RunFacultyTier();
    expect(orchestrator.CreateAndConfirmPipeline).toHaveBeenCalledWith({
      scopeType: 'FACULTY',
      scopeId: 'fac-1',
      semesterId: 'sem-1',
      triggeredById: 'system-1',
    });
  });

  it('isRunning concurrency guard prevents overlapping tier runs (AC18)', async () => {
    await buildModule({
      scopes: [
        {
          scopeType: 'DEPARTMENT',
          scopeId: 'dept-1',
          semesterId: 'sem-1',
          lastPipelineCompletedAt: null,
        },
      ],
    });
    let releaseFirst!: () => void;
    repo.FindChangedSince.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseFirst = () => resolve({ ids: ['x'], count: 1 });
        }),
    );

    const first = job.RunDepartmentTier();
    const second = await job.RunDepartmentTier();
    expect(second.status).toBe('skipped');
    expect(second.details).toMatch(/already running/i);

    releaseFirst();
    await first;
  });

  it('different tiers run concurrently (per-tier flag isolation)', async () => {
    await buildModule({
      scopes: [
        {
          scopeType: 'FACULTY',
          scopeId: 'f-1',
          semesterId: 'sem-1',
          lastPipelineCompletedAt: null,
        },
      ],
    });
    // FACULTY tier hangs on FindChangedSince; DEPARTMENT tier finds no
    // scopes and exits cleanly. This isolates the per-tier isRunning flag.
    let release!: () => void;
    repo.FindChangedSince.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ids: ['x'], count: 1 });
        }),
    );
    orchestrator.FindActiveScopesForTier.mockImplementation((tier: string) =>
      Promise.resolve(
        tier === 'FACULTY'
          ? [
              {
                scopeType: 'FACULTY',
                scopeId: 'f-1',
                semesterId: 'sem-1',
                lastPipelineCompletedAt: null,
              },
            ]
          : [],
      ),
    );

    const facultyRun = job.RunFacultyTier();
    const departmentRun = await job.RunDepartmentTier();
    expect(departmentRun.status).toBe('executed');

    release();
    await facultyRun;
  });

  it('returns "failed" status when no system user can be resolved', async () => {
    await buildModule({
      scopes: [
        {
          scopeType: 'CAMPUS',
          scopeId: 'c-1',
          semesterId: 'sem-1',
          lastPipelineCompletedAt: null,
        },
      ],
      systemUser: null,
    });
    const result = await job.RunCampusTier();
    expect(result.status).toBe('failed');
    expect(orchestrator.CreateAndConfirmPipeline).not.toHaveBeenCalled();
  });

  it('continues processing other scopes when one throws', async () => {
    await buildModule({
      scopes: [
        {
          scopeType: 'FACULTY',
          scopeId: 'good',
          semesterId: 'sem-1',
          lastPipelineCompletedAt: null,
        },
        {
          scopeType: 'FACULTY',
          scopeId: 'bad',
          semesterId: 'sem-1',
          lastPipelineCompletedAt: null,
        },
      ],
    });
    repo.FindChangedSince.mockResolvedValueOnce({
      ids: ['s'],
      count: 1,
    }).mockRejectedValueOnce(new Error('boom'));

    const result = await job.RunFacultyTier();
    expect(orchestrator.CreateAndConfirmPipeline).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('failed');
    expect(result.details).toMatch(/failed=1/);
  });
});
