import { ApiProperty } from '@nestjs/swagger';

export class DraftResponse {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  versionId!: string;

  @ApiProperty()
  facultyId!: string;

  @ApiProperty()
  semesterId!: string;

  @ApiProperty({ required: false })
  courseId?: string;

  @ApiProperty({ example: { q1: 5, q2: 4 } })
  answers!: Record<string, number>;

  @ApiProperty({ required: false })
  qualitativeComment?: string;

  @ApiProperty()
  updatedAt!: Date;
}
