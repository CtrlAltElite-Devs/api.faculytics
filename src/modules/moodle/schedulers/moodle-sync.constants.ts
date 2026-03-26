export const MOODLE_SYNC_JOB_NAME = 'moodle-sync-cron';

export const MOODLE_SYNC_CONFIG_KEY = 'MOODLE_SYNC_INTERVAL_MINUTES';

export const MOODLE_SYNC_MIN_INTERVAL_MINUTES = 30;

export const MOODLE_SYNC_INTERVAL_DEFAULTS: Record<string, number> = {
  development: 60,
  test: 60,
  staging: 360,
  production: 180,
};

export function minutesToCron(minutes: number): string {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? '0 * * * *' : `0 */${hours} * * *`;
  }
  return minutes === 1 ? '* * * * *' : `*/${minutes} * * * *`;
}
