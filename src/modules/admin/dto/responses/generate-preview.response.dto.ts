import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PreviewQuestionDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  text: string;

  @ApiProperty()
  sectionName: string;
}

export class PreviewRowDto {
  @ApiProperty()
  externalId: string;

  @ApiProperty()
  username: string;

  @ApiProperty()
  facultyUsername: string;

  @ApiProperty()
  courseShortname: string;

  @ApiProperty({ description: 'Map of questionId -> numeric value' })
  answers: Record<string, number>;

  @ApiPropertyOptional()
  comment?: string;
}

export class PreviewMetadataDto {
  @ApiProperty()
  faculty: { username: string; fullName: string };

  @ApiProperty()
  course: { shortname: string; fullname: string };

  @ApiProperty()
  semester: { code: string; label: string; academicYear: string };

  @ApiProperty()
  version: { id: string; versionNumber: number };

  @ApiProperty()
  maxScore: number;

  @ApiProperty()
  totalEnrolled: number;

  @ApiProperty()
  alreadySubmitted: number;

  @ApiProperty()
  availableStudents: number;

  @ApiProperty()
  generatingCount: number;
}

export class GeneratePreviewResponseDto {
  @ApiProperty({ type: PreviewMetadataDto })
  metadata: PreviewMetadataDto;

  @ApiProperty({ type: [PreviewQuestionDto] })
  questions: PreviewQuestionDto[];

  @ApiProperty({ type: [PreviewRowDto] })
  rows: PreviewRowDto[];
}
