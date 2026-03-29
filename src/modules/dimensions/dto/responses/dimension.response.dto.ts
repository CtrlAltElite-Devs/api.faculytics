import { ApiProperty } from '@nestjs/swagger';
import { Dimension } from 'src/entities/dimension.entity';

export class DimensionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  code: string;

  @ApiProperty()
  displayName: string;

  @ApiProperty()
  questionnaireType: { id: string; name: string; code: string };

  @ApiProperty()
  active: boolean;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  static Map(dimension: Dimension): DimensionResponseDto {
    return {
      id: dimension.id,
      code: dimension.code,
      displayName: dimension.displayName,
      questionnaireType: {
        id: dimension.questionnaireType.id,
        name: dimension.questionnaireType.name,
        code: dimension.questionnaireType.code,
      },
      active: dimension.active,
      createdAt: dimension.createdAt.toISOString(),
      updatedAt: dimension.updatedAt.toISOString(),
    };
  }
}
