import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { IsOptional } from 'class-validator';
import { BooleanQueryTransform } from './boolean-query.transform';

class TestDto {
  @IsOptional()
  @BooleanQueryTransform()
  flag?: boolean;
}

describe('BooleanQueryTransform', () => {
  const transform = (plain: Record<string, unknown>) =>
    plainToInstance(TestDto, plain, { enableImplicitConversion: true });

  it('should transform string "true" to boolean true', () => {
    expect(transform({ flag: 'true' }).flag).toBe(true);
  });

  it('should transform string "false" to boolean false', () => {
    expect(transform({ flag: 'false' }).flag).toBe(false);
  });

  it('should preserve undefined when key is absent', () => {
    expect(transform({}).flag).toBeUndefined();
  });

  it('should return undefined for explicit null', () => {
    expect(transform({ flag: null }).flag).toBeUndefined();
  });

  it('should pass through boolean true unchanged', () => {
    expect(transform({ flag: true }).flag).toBe(true);
  });

  it('should pass through boolean false unchanged', () => {
    expect(transform({ flag: false }).flag).toBe(false);
  });

  it('should treat non-"true" strings as false', () => {
    expect(transform({ flag: 'yes' }).flag).toBe(false);
    expect(transform({ flag: '1' }).flag).toBe(false);
    expect(transform({ flag: '' }).flag).toBe(false);
  });
});
