import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CheckSubmissionResponse {
  @ApiProperty()
  submitted!: boolean;

  @ApiPropertyOptional()
  submittedAt?: Date;

  @ApiPropertyOptional()
  archived?: boolean;
}
