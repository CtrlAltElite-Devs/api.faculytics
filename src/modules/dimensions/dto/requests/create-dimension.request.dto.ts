import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateDimensionRequestDto {
  @IsString()
  @IsOptional()
  @Matches(/^[A-Z][A-Z0-9_]*$/, {
    message:
      'code must be uppercase alphanumeric with underscores (e.g. TEACHING_QUALITY)',
  })
  code?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  displayName: string;

  @IsUUID()
  @IsNotEmpty()
  questionnaireTypeId: string;
}
