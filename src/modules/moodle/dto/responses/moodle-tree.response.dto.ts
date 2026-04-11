import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsString, ValidateNested } from 'class-validator';

export class MoodleCategoryTreeNodeDto {
  @ApiProperty({ example: 5 })
  @IsNumber()
  id: number;

  @ApiProperty({ example: 'Campus A' })
  @IsString()
  name: string;

  @ApiProperty({ example: 1 })
  @IsNumber()
  depth: number;

  @ApiProperty({ example: 12 })
  @IsNumber()
  coursecount: number;

  @ApiProperty({ example: 1 })
  @IsNumber()
  visible: number;

  @ApiProperty({ type: () => [MoodleCategoryTreeNodeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MoodleCategoryTreeNodeDto)
  children: MoodleCategoryTreeNodeDto[];
}

export class MoodleCategoryTreeResponseDto {
  @ApiProperty({ type: [MoodleCategoryTreeNodeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MoodleCategoryTreeNodeDto)
  tree: MoodleCategoryTreeNodeDto[];

  @ApiProperty({ example: '2026-04-11T10:00:00.000Z' })
  @IsString()
  fetchedAt: string;

  @ApiProperty({ example: 25 })
  @IsNumber()
  totalCategories: number;
}
