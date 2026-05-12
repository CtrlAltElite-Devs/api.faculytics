import { sanitizeRequestPayload } from './sanitize-request';

describe('sanitizeRequestPayload', () => {
  it('redacts top-level sensitive keys', () => {
    const result = sanitizeRequestPayload({
      username: 'ucmn-t-67092',
      password: 'Password789#',
    });
    expect(result).toEqual({
      username: 'ucmn-t-67092',
      password: '[REDACTED]',
    });
  });

  it('redacts nested sensitive keys', () => {
    const result = sanitizeRequestPayload({
      user: { username: 'a', currentPassword: 'old', newPassword: 'new' },
      tokens: { refreshToken: 'abc', accessToken: 'xyz' },
    });
    expect(result).toEqual({
      user: {
        username: 'a',
        currentPassword: '[REDACTED]',
        newPassword: '[REDACTED]',
      },
      tokens: { refreshToken: '[REDACTED]', accessToken: '[REDACTED]' },
    });
  });

  it('treats sensitive-key match as case-insensitive', () => {
    const result = sanitizeRequestPayload({
      Password: 'a',
      PASSWORD: 'b',
      Authorization: 'Bearer abc',
    });
    expect(result).toEqual({
      Password: '[REDACTED]',
      PASSWORD: '[REDACTED]',
      Authorization: '[REDACTED]',
    });
  });

  it('returns undefined for non-object payloads', () => {
    expect(sanitizeRequestPayload(null)).toBeUndefined();
    expect(sanitizeRequestPayload('string')).toBeUndefined();
    expect(sanitizeRequestPayload(42)).toBeUndefined();
    expect(sanitizeRequestPayload([1, 2])).toBeUndefined();
  });

  it('truncates very long strings', () => {
    const long = 'a'.repeat(5000);
    const result = sanitizeRequestPayload({ note: long });
    expect((result?.note as string).length).toBeLessThanOrEqual(4100);
    expect(result?.note).toMatch(/\[truncated\]$/);
  });

  it('caps recursion depth to avoid pathological payloads', () => {
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let i = 0; i < 20; i++) {
      cursor.next = {};
      cursor = cursor.next as Record<string, unknown>;
    }
    const result = sanitizeRequestPayload(deep);
    // Walk down until we see the truncation marker.
    let node: unknown = result;
    let saw = false;
    for (let i = 0; i < 20 && typeof node === 'object' && node !== null; i++) {
      if (node === '[TRUNCATED_DEPTH]') {
        saw = true;
        break;
      }
      node = (node as Record<string, unknown>).next;
      if (node === '[TRUNCATED_DEPTH]') {
        saw = true;
        break;
      }
    }
    expect(saw).toBe(true);
  });

  it('preserves arrays of primitives', () => {
    const result = sanitizeRequestPayload({ tags: ['a', 'b', 'c'] });
    expect(result).toEqual({ tags: ['a', 'b', 'c'] });
  });
});
