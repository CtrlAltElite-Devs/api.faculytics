import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class FilterCoursesQueryDto {
  @ApiProperty({ description: 'Faculty username to filter courses by' })
  @IsString()
  @IsNotEmpty()
  facultyUsername: string;
}
