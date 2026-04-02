import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class DeanEligibleCategoriesQueryDto {
  @ApiProperty({
    description: 'UUID of the user to check dean eligibility for',
  })
  @IsUUID()
  userId: string;
}
