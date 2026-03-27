import { jwtEnvSchema, warnOnWeakJwtConfig } from './jwt.env';

describe('jwtEnvSchema', () => {
  const originalWarn = console.warn;

  beforeEach(() => {
    console.warn = jest.fn();
  });

  afterEach(() => {
    console.warn = originalWarn;
  });

  it('applies defaults for optional JWT settings', () => {
    const result = jwtEnvSchema.parse({
      JWT_SECRET: 'secret',
      REFRESH_SECRET: 'refresh-secret',
    });

    expect(result.JWT_ACCESS_TOKEN_EXPIRY).toBe('300s');
    expect(result.JWT_REFRESH_TOKEN_EXPIRY).toBe('30d');
    expect(result.JWT_BCRYPT_ROUNDS).toBe(10);
  });

  it('rejects invalid duration strings', () => {
    expect(() =>
      jwtEnvSchema.parse({
        JWT_SECRET: 'secret',
        REFRESH_SECRET: 'refresh-secret',
        JWT_ACCESS_TOKEN_EXPIRY: 'later',
      }),
    ).toThrow();

    expect(() =>
      jwtEnvSchema.parse({
        JWT_SECRET: 'secret',
        REFRESH_SECRET: 'refresh-secret',
        JWT_REFRESH_TOKEN_EXPIRY: '0d',
      }),
    ).toThrow();
  });

  it('rejects non-positive bcrypt rounds', () => {
    expect(() =>
      jwtEnvSchema.parse({
        JWT_SECRET: 'secret',
        REFRESH_SECRET: 'refresh-secret',
        JWT_BCRYPT_ROUNDS: '0',
      }),
    ).toThrow();

    expect(() =>
      jwtEnvSchema.parse({
        JWT_SECRET: 'secret',
        REFRESH_SECRET: 'refresh-secret',
        JWT_BCRYPT_ROUNDS: '1.5',
      }),
    ).toThrow();
  });

  it('warns for weak bcrypt rounds outside production', () => {
    warnOnWeakJwtConfig({
      NODE_ENV: 'development',
      JWT_BCRYPT_ROUNDS: 8,
    });

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('JWT_BCRYPT_ROUNDS'),
    );
  });

  it('does not warn for weak bcrypt rounds in production', () => {
    warnOnWeakJwtConfig({
      NODE_ENV: 'production',
      JWT_BCRYPT_ROUNDS: 8,
    });

    expect(console.warn).not.toHaveBeenCalled();
  });
});
