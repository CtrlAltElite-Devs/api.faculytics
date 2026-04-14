import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CampusHeadEligibleCategoriesQueryDto {
  @ApiProperty({
    description: 'UUID of the user to check campus-head eligibility for',
  })
  @IsUUID()
  userId: string;
}
