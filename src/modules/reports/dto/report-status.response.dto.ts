import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReportStatusResponseDto {
  @ApiProperty()
  jobId: string;

  @ApiProperty({
    enum: ['waiting', 'active', 'completed', 'failed', 'skipped'],
  })
  status: string;

  @ApiProperty()
  facultyName: string;

  @ApiPropertyOptional({
    description: 'Presigned download URL, present when completed',
  })
  downloadUrl?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp of URL expiry' })
  expiresAt?: string;

  @ApiPropertyOptional({ description: 'Error message, present when failed' })
  error?: string;

  @ApiPropertyOptional({ description: 'Info message, present when skipped' })
  message?: string;

  @ApiProperty()
  createdAt: string;

  @ApiPropertyOptional()
  completedAt?: string;
}
