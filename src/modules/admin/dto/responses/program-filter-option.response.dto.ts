import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProgramFilterOptionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  code: string;

  @ApiPropertyOptional({ nullable: true })
  name: string | null;

  @ApiProperty({ description: 'Moodle category ID for this program' })
  moodleCategoryId: number;

  static MapProgram(entity: {
    id: string;
    code: string;
    name?: string;
    moodleCategoryId: number;
  }): ProgramFilterOptionResponseDto {
    const dto = new ProgramFilterOptionResponseDto();
    dto.id = entity.id;
    dto.code = entity.code;
    dto.name = entity.name ?? null;
    dto.moodleCategoryId = entity.moodleCategoryId;
    return dto;
  }
}
