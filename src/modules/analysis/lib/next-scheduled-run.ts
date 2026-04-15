import { Logger } from '@nestjs/common';
import type { SchedulerRegistry } from '@nestjs/schedule';
import { parseExpression } from 'cron-parser';
import type { ScopeType } from '../dto/facet.dto';
import {
  TIERED_SCHEDULER_CRON_EXPRS,
  TIERED_SCHEDULER_CRON_NAMES,
} from 'src/crons/jobs/analysis-jobs/tiered-pipeline-scheduler.job';

const logger = new Logger('NextScheduledRun');

/**
 * Resolves the next scheduled fire time for a tier in ISO 8601 UTC.
 *
 * Strategy (R3 mitigation, see AC38):
 *  1. Try `SchedulerRegistry.getCronJob(name).nextDate()` first — it may
 *     return luxon DateTime, Date, or undefined depending on
 *     @nestjs/schedule + cron lib version compatibility.
 *  2. Fall back to parsing the stored cron expression directly via
 *     `cron-parser` if the registry lookup throws or returns null.
 *  3. Return null only when both paths fail (frontend then renders the
 *     generic "Refreshes weekly on Mondays" copy).
 */
export function getNextScheduledRunAt(
  registry: SchedulerRegistry,
  tier: ScopeType,
): string | null {
  const cronName = TIERED_SCHEDULER_CRON_NAMES[tier];
  const cronExpr = TIERED_SCHEDULER_CRON_EXPRS[tier];

  try {
    const job = registry.getCronJob(cronName);
    // `nextDate()` returns a CronJob date wrapper (cron-parser CronDate or
    // luxon DateTime depending on the @nestjs/schedule version). Both
    // expose a `toISOString()` method, but to be defensive across versions
    // we prefer the explicit `.toJSDate()` (luxon) → `Date` conversion
    // before serializing.
    const next = job.nextDate() as unknown as {
      toJSDate?: () => Date;
      toISOString?: () => string;
    } | null;
    if (next) {
      if (typeof next.toJSDate === 'function') {
        const date = next.toJSDate();
        if (date instanceof Date && !Number.isNaN(date.getTime())) {
          return date.toISOString();
        }
      }
      if (typeof next.toISOString === 'function') {
        const iso = next.toISOString();
        if (typeof iso === 'string') return iso;
      }
    }
  } catch (err) {
    logger.debug(
      `SchedulerRegistry lookup failed for ${cronName}: ${(err as Error).message} — falling back to cron-parser`,
    );
  }

  try {
    const interval = parseExpression(cronExpr, { utc: true });
    return interval.next().toDate().toISOString();
  } catch (err) {
    logger.warn(
      `cron-parser fallback failed for ${cronExpr}: ${(err as Error).message}`,
    );
    return null;
  }
}

/**
 * Resolves the tier from a pipeline's populated FK columns.
 * Faculty-scoped pipelines refresh on the FACULTY tier, and so on. Legacy
 * pipelines (program/course only) fall back to FACULTY since they predate
 * the tier model.
 */
export function tierFromPipelineScope(pipeline: {
  faculty?: { id: string } | null;
  department?: { id: string } | null;
  campus?: { id: string } | null;
}): ScopeType {
  if (pipeline.faculty) return 'FACULTY';
  if (pipeline.department) return 'DEPARTMENT';
  if (pipeline.campus) return 'CAMPUS';
  return 'FACULTY';
}
