import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from 'src/entities/user.entity';

export class FacultyCardResponseDto {
  @ApiProperty({ description: 'Faculty user UUID' })
  id: string;

  @ApiProperty({ description: 'Faculty full name' })
  fullName: string;

  @ApiPropertyOptional({
    description: 'Profile picture URL',
    nullable: true,
  })
  profilePicture: string | null;

  @ApiProperty({
    description: 'Course shortnames within caller scope, sorted alphabetically',
    type: [String],
  })
  subjects: string[];

  static Map(user: User, courseShortnames: string[]): FacultyCardResponseDto {
    const dto = new FacultyCardResponseDto();
    dto.id = user.id;
    dto.fullName = user.fullName ?? `${user.firstName} ${user.lastName}`;
    dto.profilePicture = user.userProfilePicture || null;
    dto.subjects = [...courseShortnames].sort();
    return dto;
  }
}
