import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreateVersionFromTemplateRequest {
  @ApiProperty({ description: 'UUID of the version to copy the schema from' })
  @IsUUID()
  sourceVersionId!: string;
}
