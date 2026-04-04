import { ApiProperty } from '@nestjs/swagger';

export class SubmissionStatusResponseDto {
  @ApiProperty()
  totalEnrolled: number;

  @ApiProperty()
  alreadySubmitted: number;

  @ApiProperty()
  availableStudents: number;
}
