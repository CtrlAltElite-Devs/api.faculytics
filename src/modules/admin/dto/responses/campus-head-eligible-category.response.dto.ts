import { ApiProperty } from '@nestjs/swagger';
import { MoodleCategory } from 'src/entities/moodle-category.entity';

export class CampusHeadEligibleCategoryResponseDto {
  @ApiProperty({ description: 'UUID of the MoodleCategory row' })
  id: string;

  @ApiProperty({
    description: 'Moodle category ID for the campus',
    example: 2,
  })
  moodleCategoryId: number;

  @ApiProperty({
    description: 'Category name (serves as the campus code, e.g. UCMN)',
    example: 'UCMN',
  })
  name: string;

  @ApiProperty({
    description: 'Moodle category depth — always 1 for campus-level',
    example: 1,
  })
  depth: number;

  static Map(category: MoodleCategory): CampusHeadEligibleCategoryResponseDto {
    return {
      id: category.id,
      moodleCategoryId: category.moodleCategoryId,
      name: category.name,
      depth: category.depth,
    };
  }
}
