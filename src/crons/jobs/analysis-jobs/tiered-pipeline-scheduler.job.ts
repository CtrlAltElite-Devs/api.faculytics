import { Injectable } from '@nestjs/common';
import { Cron, SchedulerRegistry } from '@nestjs/schedule';
import { EntityManager } from '@mikro-orm/postgresql';
import { BaseJob } from 'src/crons/base.job';
import { JobRecordType } from 'src/crons/startup-job-registry';
import { User } from 'src/entities/user.entity';
import { UserRole } from 'src/modules/auth/roles.enum';
import { env } from 'src/configurations/env';
import { QuestionnaireSubmission } from 'src/entities/questionnaire-submission.entity';
import { QuestionnaireSubmissionRepository } from 'src/repositories/questionnaire-submission.repository';
import {
  type ActiveScopeForTier,
  PipelineOrchestratorService,
} from 'src/modules/analysis/services/pipeline-orchestrator.service';
import type { ScopeType } from 'src/modules/analysis/dto/facet.dto';
import {
  TIERED_SCHEDULER_CRON_EXPRS,
  TIERED_SCHEDULER_CRON_NAMES,
} from './tiered-scheduler.constants';

// Re-exported for back-compat with imports that referenced the job module.
export {
  TIERED_SCHEDULER_CRON_EXPRS,
  TIERED_SCHEDULER_CRON_NAMES,
} from './tiered-scheduler.constants';

@Injectable()
export class TieredPipelineSchedulerJob extends BaseJob {
  // Per-tier concurrency guard. Three independent flags so a long-running
  // faculty tier doesn't block a department/campus tier that happens to
  // overlap in clock time.
  private readonly running: Record<ScopeType, boolean> = {
    FACULTY: false,
    DEPARTMENT: false,
    CAMPUS: false,
  };

  constructor(
    private readonly orchestrator: PipelineOrchestratorService,
    private readonly em: EntityManager,
    schedulerRegistry: SchedulerRegistry,
  ) {
    super(schedulerRegistry, TieredPipelineSchedulerJob.name);
  }

  // Resolves the custom repo from the EntityManager so the cron job
  // doesn't need its own MikroOrmModule.forFeature wiring.
  private get submissionRepository(): QuestionnaireSubmissionRepository {
    return this.em.getRepository(QuestionnaireSubmission);
  }

  protected runStartupTask(): Promise<JobRecordType> {
    return Promise.resolve({
      status: 'skipped',
      details: 'Tiered scheduler runs on cron only — no startup execution',
    });
  }

  @Cron(TIERED_SCHEDULER_CRON_EXPRS.FACULTY, {
    name: TIERED_SCHEDULER_CRON_NAMES.FACULTY,
  })
  async RunFacultyTier(): Promise<JobRecordType> {
    return this.runTier('FACULTY');
  }

  @Cron(TIERED_SCHEDULER_CRON_EXPRS.DEPARTMENT, {
    name: TIERED_SCHEDULER_CRON_NAMES.DEPARTMENT,
  })
  async RunDepartmentTier(): Promise<JobRecordType> {
    return this.runTier('DEPARTMENT');
  }

  @Cron(TIERED_SCHEDULER_CRON_EXPRS.CAMPUS, {
    name: TIERED_SCHEDULER_CRON_NAMES.CAMPUS,
  })
  async RunCampusTier(): Promise<JobRecordType> {
    // Spec leaves an open option to no-op campus tier (since campus-wide
    // topic modeling is opt-in via the dashboard button). We keep it as a
    // real run for now — campus rollups still benefit from refreshed
    // per-department pipelines downstream, and the skip-check guarantees
    // we don't re-run unchanged scopes.
    return this.runTier('CAMPUS');
  }

  private async runTier(tier: ScopeType): Promise<JobRecordType> {
    if (this.running[tier]) {
      this.logger.log(
        `Tiered scheduler ${tier} tier already running — skipping this firing`,
      );
      return {
        status: 'skipped',
        details: `${tier} tier already running`,
      };
    }
    this.running[tier] = true;
    const startedAt = Date.now();

    let attempted = 0;
    let enqueued = 0;
    let skipped = 0;
    let failed = 0;

    try {
      const systemUserId = await this.resolveSystemUserId();
      if (!systemUserId) {
        this.logger.error(
          'No SUPER_ADMIN system user found — cannot attribute scheduler-driven pipelines',
        );
        return {
          status: 'failed',
          details: 'No system user available for scheduler attribution',
        };
      }

      const scopes = await this.orchestrator.FindActiveScopesForTier(tier);
      this.logger.log(
        `Tiered scheduler ${tier} tier: ${scopes.length} scope(s) to evaluate`,
      );

      for (const scope of scopes) {
        attempted++;
        try {
          const result = await this.processScope(scope, systemUserId);
          if (result === 'enqueued') enqueued++;
          else skipped++;
        } catch (err) {
          failed++;
          this.logger.error(
            `Scheduler failed for ${tier} scope ${scope.scopeId} (semester ${scope.semesterId}): ${(err as Error).message}`,
          );
        }
      }

      const elapsedMs = Date.now() - startedAt;
      const summary = `${tier}: attempted=${attempted}, enqueued=${enqueued}, skipped=${skipped}, failed=${failed}, elapsedMs=${elapsedMs}`;
      this.logger.log(`Tiered scheduler complete — ${summary}`);
      return {
        status: failed === 0 ? 'executed' : 'failed',
        details: summary,
      };
    } finally {
      this.running[tier] = false;
    }
  }

  /**
   * Single scope evaluation. Returns 'enqueued' if a pipeline was created,
   * 'skipped' if the scope had no new submissions since the last completed
   * pipeline.
   */
  private async processScope(
    scope: ActiveScopeForTier,
    systemUserId: string,
  ): Promise<'enqueued' | 'skipped'> {
    const changed = await this.submissionRepository.FindChangedSince(
      this.scopeFilter(scope),
      scope.lastPipelineCompletedAt,
    );
    if (changed.count === 0) {
      this.logger.debug(
        `Skip ${scope.scopeType} ${scope.scopeId} (semester ${scope.semesterId}) — no new submissions since ${scope.lastPipelineCompletedAt?.toISOString() ?? 'epoch'}`,
      );
      return 'skipped';
    }

    await this.orchestrator.CreateAndConfirmPipeline({
      scopeType: scope.scopeType,
      scopeId: scope.scopeId,
      semesterId: scope.semesterId,
      triggeredById: systemUserId,
    });
    return 'enqueued';
  }

  private scopeFilter(scope: ActiveScopeForTier) {
    const base = { semester: scope.semesterId };
    switch (scope.scopeType) {
      case 'FACULTY':
        return { ...base, faculty: scope.scopeId };
      case 'DEPARTMENT':
        return { ...base, department: scope.scopeId };
      case 'CAMPUS':
        return { ...base, campus: scope.scopeId };
    }
  }

  private async resolveSystemUserId(): Promise<string | null> {
    // Use the seeded super admin as the scheduler's "system" identity.
    // Looked up by username so a future rename of the admin doesn't strand
    // the scheduler. Cached after the first lookup is intentionally NOT
    // done here — repeated lookups are cheap (indexed unique column) and
    // the cache invalidation cost (e.g., admin rotated mid-run) is not
    // worth the few-µs save.
    const fork = this.em.fork();
    const user = await fork.findOne(
      User,
      { userName: env.SUPER_ADMIN_USERNAME },
      { fields: ['id', 'roles'] },
    );
    return user?.id ?? null;
  }

  // Module-level access for the analytics module to wire UserRole into a
  // future export pattern if needed; currently used only inside this file.
  static readonly SYSTEM_ROLES: UserRole[] = [UserRole.SUPER_ADMIN];
}
