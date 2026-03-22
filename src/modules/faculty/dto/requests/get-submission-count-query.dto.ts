import { IsNotEmpty, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class GetSubmissionCountQueryDto {
  @ApiProperty({ description: 'Semester UUID to scope submission count' })
  @IsUUID()
  @IsNotEmpty()
  semesterId: string;
}
