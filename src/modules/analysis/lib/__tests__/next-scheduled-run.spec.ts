import { SchedulerRegistry } from '@nestjs/schedule';
import {
  getNextScheduledRunAt,
  tierFromPipelineScope,
} from '../next-scheduled-run';

describe('getNextScheduledRunAt', () => {
  it('falls back to cron-parser when SchedulerRegistry has no job (AC38)', () => {
    const registry = new SchedulerRegistry();
    const iso = getNextScheduledRunAt(registry, 'FACULTY');
    expect(iso).not.toBeNull();
    expect(() => new Date(iso!).toISOString()).not.toThrow();
    // Fallback should still produce a future Sunday 01:00 UTC
    const next = new Date(iso!);
    expect(next.getUTCHours()).toBe(1);
    expect(next.getUTCDay()).toBe(0); // Sunday
  });

  it('returns ISO string for DEPARTMENT tier', () => {
    const iso = getNextScheduledRunAt(new SchedulerRegistry(), 'DEPARTMENT');
    expect(iso).not.toBeNull();
    expect(new Date(iso!).getUTCHours()).toBe(2);
  });

  it('returns ISO string for CAMPUS tier', () => {
    const iso = getNextScheduledRunAt(new SchedulerRegistry(), 'CAMPUS');
    expect(iso).not.toBeNull();
    expect(new Date(iso!).getUTCHours()).toBe(3);
  });
});

describe('tierFromPipelineScope', () => {
  it('returns FACULTY when faculty FK populated', () => {
    expect(tierFromPipelineScope({ faculty: { id: 'f' } })).toBe('FACULTY');
  });
  it('returns DEPARTMENT when only department FK populated', () => {
    expect(tierFromPipelineScope({ department: { id: 'd' } })).toBe(
      'DEPARTMENT',
    );
  });
  it('returns CAMPUS when only campus FK populated', () => {
    expect(tierFromPipelineScope({ campus: { id: 'c' } })).toBe('CAMPUS');
  });
  it('falls back to FACULTY for legacy (program/course only) rows', () => {
    expect(tierFromPipelineScope({})).toBe('FACULTY');
  });
});
