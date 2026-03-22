import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AttentionFlagDto {
  @ApiProperty({
    enum: ['declining_trend', 'quant_qual_gap', 'low_coverage'],
  })
  type!: 'declining_trend' | 'quant_qual_gap' | 'low_coverage';

  @ApiProperty()
  description!: string;

  @ApiProperty()
  metrics!: Record<string, number>;
}

export class AttentionItemDto {
  @ApiProperty()
  facultyId!: string;

  @ApiProperty()
  facultyName!: string;

  @ApiProperty()
  departmentCode!: string;

  @ApiProperty({ type: [AttentionFlagDto] })
  flags!: AttentionFlagDto[];
}

export class AttentionListResponseDto {
  @ApiProperty({ type: [AttentionItemDto] })
  items!: AttentionItemDto[];

  @ApiPropertyOptional({ type: String, nullable: true })
  lastRefreshedAt!: string | null;
}
