import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';

export class CreateQuestionnaireTypeRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({
    description: 'SCREAMING_SNAKE_CASE identifier (e.g. PEER_REVIEW)',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message: 'code must be SCREAMING_SNAKE_CASE (e.g. PEER_REVIEW)',
  })
  code!: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;
}
