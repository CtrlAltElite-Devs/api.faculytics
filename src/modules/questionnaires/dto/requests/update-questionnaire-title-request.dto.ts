import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateQuestionnaireTitleRequest {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;
}
