import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class FilterVersionsQueryDto {
  @ApiProperty({ description: 'Questionnaire type UUID' })
  @IsUUID()
  @IsNotEmpty()
  typeId: string;
}
