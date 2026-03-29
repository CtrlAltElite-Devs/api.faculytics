import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class CreateQuestionnaireRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ description: 'UUID of the questionnaire type' })
  @IsUUID()
  @IsNotEmpty()
  typeId!: string;
}
