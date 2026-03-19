import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Department } from 'src/entities/department.entity';

export class DepartmentItemResponseDto {
  @ApiProperty({ description: 'Department UUID' })
  id: string;

  @ApiProperty({ description: 'Department code (e.g., "CCS")' })
  code: string;

  @ApiPropertyOptional({
    description: 'Department name',
    nullable: true,
  })
  name: string | null;

  static Map(department: Department): DepartmentItemResponseDto {
    const dto = new DepartmentItemResponseDto();
    dto.id = department.id;
    dto.code = department.code;
    dto.name = department.name ?? null;
    return dto;
  }
}
