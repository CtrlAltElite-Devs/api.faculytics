import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GeneratedRowDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  externalId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  username: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  facultyUsername: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  courseShortname: string;

  @ApiProperty({ description: 'Map of questionId -> numeric value' })
  @IsObject()
  answers: Record<string, number>;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  comment?: string;
}

export class GenerateCommitRequestDto {
  @ApiProperty({ description: 'Questionnaire version UUID' })
  @IsUUID()
  @IsNotEmpty()
  versionId: string;

  @ApiProperty({ type: [GeneratedRowDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => GeneratedRowDto)
  rows: GeneratedRowDto[];
}
