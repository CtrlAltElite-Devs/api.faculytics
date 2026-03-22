import { ApiProperty } from '@nestjs/swagger';
import { Course } from 'src/entities/course.entity';

export class CourseItemResponseDto {
  @ApiProperty({ description: 'Course UUID' })
  id: string;

  @ApiProperty({ description: 'Course shortname (e.g., "FREAI", "ELDNET1")' })
  shortname: string;

  @ApiProperty({
    description: 'Course fullname (e.g., "Free Elective AI")',
  })
  fullname: string;

  @ApiProperty({ description: 'Parent program UUID' })
  programId: string;

  @ApiProperty({ description: 'Whether the course is active in Moodle' })
  isActive: boolean;

  static Map(course: Course): CourseItemResponseDto {
    const dto = new CourseItemResponseDto();
    dto.id = course.id;
    dto.shortname = course.shortname;
    dto.fullname = course.fullname;
    dto.programId = course.program.id;
    dto.isActive = course.isActive;
    return dto;
  }
}
