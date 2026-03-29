import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FilterOptionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  code: string;

  @ApiPropertyOptional({ nullable: true })
  name: string | null;

  static Map(entity: {
    id: string;
    code: string;
    name?: string;
  }): FilterOptionResponseDto {
    return {
      id: entity.id,
      code: entity.code,
      name: entity.name ?? null,
    };
  }
}
