// Fields whose values are stripped from captured request bodies/queries before
// they're persisted. Match by lowercase key to catch casing variants.
const SENSITIVE_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'oldpassword',
  'confirmpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cookie',
  'set-cookie',
  'apikey',
  'api_key',
  'secret',
  'clientsecret',
]);

const REDACTION = '[REDACTED]';
const MAX_DEPTH = 6;
const MAX_KEYS_PER_OBJECT = 200;
const MAX_STRING_LENGTH = 4000;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth >= MAX_DEPTH) return '[TRUNCATED_DEPTH]';

  if (typeof value === 'string') {
    return value.length > MAX_STRING_LENGTH
      ? `${value.slice(0, MAX_STRING_LENGTH)}…[truncated]`
      : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};
    let count = 0;
    for (const [key, val] of Object.entries(value)) {
      if (count >= MAX_KEYS_PER_OBJECT) {
        result['[TRUNCATED_KEYS]'] = true;
        break;
      }
      count++;
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        result[key] = REDACTION;
      } else {
        result[key] = sanitizeValue(val, depth + 1);
      }
    }
    return result;
  }

  return value;
}

/**
 * Walks an arbitrary JSON-like payload and replaces any value under a known
 * sensitive key with `[REDACTED]`. Also caps depth/breadth/string length so a
 * pathological payload can't blow up the error_log table.
 */
export function sanitizeRequestPayload(
  payload: unknown,
): Record<string, unknown> | undefined {
  if (!isPlainObject(payload)) return undefined;
  const sanitized = sanitizeValue(payload, 0);
  return isPlainObject(sanitized) ? sanitized : undefined;
}
