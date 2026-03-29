import { IsOptional } from 'class-validator';
import { BooleanQueryTransform } from 'src/modules/common/transforms/boolean-query.transform';

export class ListQuestionnaireTypesQueryDto {
  @IsOptional()
  @BooleanQueryTransform()
  isSystem?: boolean;
}
