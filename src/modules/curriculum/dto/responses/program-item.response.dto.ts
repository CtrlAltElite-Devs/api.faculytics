import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Program } from 'src/entities/program.entity';

export class ProgramItemResponseDto {
  @ApiProperty({ description: 'Program UUID' })
  id: string;

  @ApiProperty({ description: 'Program code (e.g., "BSCS", "BSIT")' })
  code: string;

  @ApiPropertyOptional({
    description: 'Program name',
    nullable: true,
  })
  name: string | null;

  @ApiProperty({ description: 'Parent department UUID' })
  departmentId: string;

  static Map(program: Program): ProgramItemResponseDto {
    const dto = new ProgramItemResponseDto();
    dto.id = program.id;
    dto.code = program.code;
    dto.name = program.name ?? null;
    dto.departmentId = program.department.id;
    return dto;
  }
}
