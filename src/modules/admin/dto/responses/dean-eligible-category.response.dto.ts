import { ApiProperty } from '@nestjs/swagger';
import { MoodleCategory } from 'src/entities/moodle-category.entity';

export class DeanEligibleCategoryResponseDto {
  @ApiProperty({
    description: 'Moodle category ID for the department',
    example: 8,
  })
  moodleCategoryId: number;

  @ApiProperty({ description: 'Department name', example: 'CCS' })
  name: string;

  static Map(category: MoodleCategory): DeanEligibleCategoryResponseDto {
    return {
      moodleCategoryId: category.moodleCategoryId,
      name: category.name,
    };
  }
}
