import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsString,
  Matches,
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

  @ApiProperty({
    description:
      'Campus code used as the username prefix (reserved "local" is forbidden to avoid collisions with Faculytics-local accounts)',
    example: 'ucmn',
  })
  @IsString()
  @Matches(/^(?!local$)[a-z0-9][a-z0-9._-]*$/i, {
    message:
      'campus code must not equal the reserved "local" prefix used by Faculytics-local accounts',
  })
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
