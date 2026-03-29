const JWT_DURATION_PATTERN =
  /^\s*(?<value>-?(?:\d+\.?\d*|\.\d+))\s*(?<unit>milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|weeks?|w|years?|yrs?|y)?\s*$/i;

const JWT_DURATION_MULTIPLIERS: Record<string, number> = {
  ms: 1,
  msec: 1,
  msecs: 1,
  millisecond: 1,
  milliseconds: 1,
  s: 1000,
  sec: 1000,
  secs: 1000,
  second: 1000,
  seconds: 1000,
  m: 60 * 1000,
  min: 60 * 1000,
  mins: 60 * 1000,
  minute: 60 * 1000,
  minutes: 60 * 1000,
  h: 60 * 60 * 1000,
  hr: 60 * 60 * 1000,
  hrs: 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
  days: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  weeks: 7 * 24 * 60 * 60 * 1000,
  y: 365.25 * 24 * 60 * 60 * 1000,
  yr: 365.25 * 24 * 60 * 60 * 1000,
  yrs: 365.25 * 24 * 60 * 60 * 1000,
  year: 365.25 * 24 * 60 * 60 * 1000,
  years: 365.25 * 24 * 60 * 60 * 1000,
};

export const parseJwtDurationToMilliseconds = (
  value: string,
): number | null => {
  const match = JWT_DURATION_PATTERN.exec(value);

  if (!match?.groups) {
    return null;
  }

  const durationValue = Number.parseFloat(match.groups.value);

  if (!Number.isFinite(durationValue) || durationValue <= 0) {
    return null;
  }

  const unit = (match.groups.unit ?? 'ms').toLowerCase();
  const multiplier = JWT_DURATION_MULTIPLIERS[unit];

  if (!multiplier) {
    return null;
  }

  const milliseconds = durationValue * multiplier;

  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return null;
  }

  return Math.floor(milliseconds);
};

export const isValidJwtDuration = (value: string): boolean =>
  parseJwtDurationToMilliseconds(value) !== null;
