import { ApiProperty } from '@nestjs/swagger';

export class SemesterFilterResponseDto {
  @ApiProperty({ description: 'Semester UUID' })
  id: string;

  @ApiProperty({ description: 'Semester code', example: 'S12526' })
  code: string;

  @ApiProperty({ description: 'Semester label', example: 'Semester 1' })
  label: string;

  @ApiProperty({ description: 'Academic year', example: '2025-2026' })
  academicYear: string;

  @ApiProperty({ description: 'Campus code', example: 'UCMN' })
  campusCode: string;

  @ApiProperty({
    description: 'Computed start date (ISO 8601)',
    example: '2025-08-01',
  })
  startDate: string;

  @ApiProperty({
    description: 'Computed end date (ISO 8601)',
    example: '2025-12-18',
  })
  endDate: string;
}
