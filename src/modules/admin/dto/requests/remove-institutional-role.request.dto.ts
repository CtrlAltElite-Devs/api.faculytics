import { IsEnum, IsNumber, IsString } from 'class-validator';
import { UserRole } from 'src/modules/auth/roles.enum';
import { ApiProperty } from '@nestjs/swagger';

export class RemoveInstitutionalRoleDto {
  @ApiProperty({ description: 'UUID of the user to remove the role from' })
  @IsString()
  userId: string;

  @ApiProperty({
    enum: [UserRole.DEAN, UserRole.CHAIRPERSON],
    description: 'The institutional role to remove',
  })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({ description: 'Moodle category ID the role is scoped to' })
  @IsNumber()
  moodleCategoryId: number;
}
