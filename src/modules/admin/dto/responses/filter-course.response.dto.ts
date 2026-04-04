import { ApiProperty } from '@nestjs/swagger';
import { Course } from 'src/entities/course.entity';

export class FilterCourseResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  shortname: string;

  @ApiProperty()
  fullname: string;

  static Map(course: Course): FilterCourseResponseDto {
    return {
      id: course.id,
      shortname: course.shortname,
      fullname: course.fullname,
    };
  }
}
