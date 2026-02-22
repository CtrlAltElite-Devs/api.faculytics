import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsOptional, IsNotEmpty } from 'class-validator';

export class GetDraftRequest {
  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  versionId!: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  facultyId!: string;

  @ApiProperty()
  @IsUUID()
  @IsNotEmpty()
  semesterId!: string;

  @ApiProperty({ required: false })
  @IsUUID()
  @IsOptional()
  courseId?: string;
}
