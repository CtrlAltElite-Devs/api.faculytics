import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { ListDimensionsQueryDto } from './list-dimensions-query.dto';

describe('ListDimensionsQueryDto', () => {
  const transform = (plain: Record<string, unknown>) =>
    plainToInstance(ListDimensionsQueryDto, plain, {
      enableImplicitConversion: true,
    });

  it('should parse active=true as boolean true', () => {
    const dto = transform({ active: 'true' });
    expect(dto.active).toBe(true);
  });

  it('should parse active=false as boolean false', () => {
    const dto = transform({ active: 'false' });
    expect(dto.active).toBe(false);
  });

  it('should leave active undefined when not provided', () => {
    const dto = transform({});
    expect(dto.active).toBeUndefined();
  });
});
