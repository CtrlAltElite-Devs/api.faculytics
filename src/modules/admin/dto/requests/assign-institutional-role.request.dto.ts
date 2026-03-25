import { IsEnum, IsNumber, IsString } from 'class-validator';
import { UserRole } from 'src/modules/auth/roles.enum';
import { ApiProperty } from '@nestjs/swagger';

export class AssignInstitutionalRoleDto {
  @ApiProperty({ description: 'UUID of the user to assign the role to' })
  @IsString()
  userId: string;

  @ApiProperty({
    enum: [UserRole.DEAN, UserRole.CHAIRPERSON],
    description: 'The institutional role to assign',
  })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty({ description: 'Moodle category ID to scope the role to' })
  @IsNumber()
  moodleCategoryId: number;
}
