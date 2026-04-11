import { ApiProperty } from '@nestjs/swagger';

export class CoursePreviewRowResponseDto {
  @ApiProperty() shortname: string;
  @ApiProperty() fullname: string;
  @ApiProperty() categoryPath: string;
  @ApiProperty() categoryId: number;
  @ApiProperty() startDate: string;
  @ApiProperty() endDate: string;
  @ApiProperty() program: string;
  @ApiProperty() semester: string;
  @ApiProperty() courseCode: string;
}

export class SkippedRowDto {
  @ApiProperty() rowNumber: number;
  @ApiProperty() courseCode: string;
  @ApiProperty() reason: string;
}

export class ParseErrorDto {
  @ApiProperty() rowNumber: number;
  @ApiProperty() message: string;
}

export class CoursePreviewResultDto {
  @ApiProperty({ type: [CoursePreviewRowResponseDto] })
  valid: CoursePreviewRowResponseDto[];

  @ApiProperty({ type: [SkippedRowDto] })
  skipped: SkippedRowDto[];

  @ApiProperty({ type: [ParseErrorDto] })
  errors: ParseErrorDto[];

  @ApiProperty({
    example:
      'EDP codes are examples. Final codes are generated at execution time.',
  })
  shortnameNote: string;
}
