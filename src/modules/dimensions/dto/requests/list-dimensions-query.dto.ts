import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { BooleanQueryTransform } from 'src/modules/common/transforms/boolean-query.transform';

export class ListDimensionsQueryDto {
  @IsUUID()
  @IsOptional()
  questionnaireTypeId?: string;

  @IsOptional()
  @BooleanQueryTransform()
  active?: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}
