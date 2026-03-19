import { ApiProperty } from '@nestjs/swagger';

export class SubmissionCountResponseDto {
  @ApiProperty({
    description: 'Number of submissions for this faculty in the given semester',
  })
  count: number;
}
