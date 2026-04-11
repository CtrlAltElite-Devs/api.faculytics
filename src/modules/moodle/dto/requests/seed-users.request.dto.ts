import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsString,
  Max,
  Min,
  ArrayMinSize,
} from 'class-validator';

export class SeedUsersRequestDto {
  @ApiProperty({
    description: 'Number of users to generate',
    example: 10,
    minimum: 1,
    maximum: 200,
  })
  @IsInt()
  @Min(1)
  @Max(200)
  count: number;

  @ApiProperty({
    description: 'User role',
    enum: ['student', 'faculty'],
    example: 'student',
  })
  @IsIn(['student', 'faculty'])
  role: 'student' | 'faculty';

  @ApiProperty({ description: 'Campus code', example: 'ucmn' })
  @IsString()
  campus: string;

  @ApiProperty({
    description: 'Moodle course IDs to enrol users into',
    example: [42, 43],
  })
  @IsArray()
  @ArrayMinSize(1, { message: 'At least one course ID is required' })
  @IsInt({ each: true })
  courseIds: number[];
}
