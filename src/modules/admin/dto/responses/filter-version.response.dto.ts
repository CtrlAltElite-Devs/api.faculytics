import { ApiProperty } from '@nestjs/swagger';
import { QuestionnaireVersion } from 'src/entities/questionnaire-version.entity';

export class FilterVersionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  versionNumber: number;

  @ApiProperty()
  isActive: boolean;

  static Map(version: QuestionnaireVersion): FilterVersionResponseDto {
    return {
      id: version.id,
      versionNumber: version.versionNumber,
      isActive: version.isActive,
    };
  }
}
