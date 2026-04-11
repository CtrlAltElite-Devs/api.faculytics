import { ApiProperty } from '@nestjs/swagger';

export class SeedUsersResultDto {
  @ApiProperty({ example: 10 })
  usersCreated: number;

  @ApiProperty({ example: 0 })
  usersFailed: number;

  @ApiProperty({ example: 20 })
  enrolmentsCreated: number;

  @ApiProperty({ type: [String], example: [] })
  warnings: string[];

  @ApiProperty({ example: 3500 })
  durationMs: number;
}
