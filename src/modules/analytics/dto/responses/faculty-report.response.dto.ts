import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReportFacultyDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class ReportSemesterDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  label!: string;

  @ApiProperty()
  academicYear!: string;
}

export class ReportQuestionnaireTypeDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

export class ReportCourseFilterDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  title!: string;
}

export class ReportQuestionDto {
  @ApiProperty()
  questionId!: string;

  @ApiProperty()
  order!: number;

  @ApiProperty()
  text!: string;

  @ApiProperty()
  average!: number;

  @ApiProperty()
  responseCount!: number;

  @ApiProperty()
  interpretation!: string;
}

export class ReportSectionDto {
  @ApiProperty()
  sectionId!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  order!: number;

  @ApiProperty()
  weight!: number;

  @ApiProperty({ type: [ReportQuestionDto] })
  questions!: ReportQuestionDto[];

  @ApiProperty()
  sectionAverage!: number;

  @ApiProperty()
  sectionInterpretation!: string;
}

export class FacultyReportResponseDto {
  @ApiProperty({ type: ReportFacultyDto })
  faculty!: ReportFacultyDto;

  @ApiProperty({ type: ReportSemesterDto })
  semester!: ReportSemesterDto;

  @ApiProperty({ type: ReportQuestionnaireTypeDto })
  questionnaireType!: ReportQuestionnaireTypeDto;

  @ApiPropertyOptional({ type: ReportCourseFilterDto, nullable: true })
  courseFilter!: ReportCourseFilterDto | null;

  @ApiProperty()
  submissionCount!: number;

  @ApiProperty({ type: [ReportSectionDto] })
  sections!: ReportSectionDto[];

  @ApiPropertyOptional({ type: Number, nullable: true })
  overallRating!: number | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  overallInterpretation!: string | null;
}
