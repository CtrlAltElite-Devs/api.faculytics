import { minutesToCron } from './moodle-sync.constants';

describe('minutesToCron', () => {
  it('should convert 1 minute to every-minute cron', () => {
    expect(minutesToCron(1)).toBe('* * * * *');
  });

  it('should convert sub-hour minutes to minute-based cron', () => {
    expect(minutesToCron(15)).toBe('*/15 * * * *');
    expect(minutesToCron(30)).toBe('*/30 * * * *');
  });

  it('should convert 60 minutes to hourly cron', () => {
    expect(minutesToCron(60)).toBe('0 * * * *');
  });

  it('should convert multiples of 60 to hour-based cron', () => {
    expect(minutesToCron(120)).toBe('0 */2 * * *');
    expect(minutesToCron(180)).toBe('0 */3 * * *');
    expect(minutesToCron(360)).toBe('0 */6 * * *');
  });

  it('should treat non-multiple-of-60 values above 60 as minute-based', () => {
    expect(minutesToCron(90)).toBe('*/90 * * * *');
  });
});
