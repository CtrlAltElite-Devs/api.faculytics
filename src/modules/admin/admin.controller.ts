import { Body, Controller, Delete, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UseJwtGuard } from 'src/security/decorators';
import { UserRole } from '../auth/roles.enum';
import { AdminService } from './services/admin.service';
import { AssignInstitutionalRoleDto } from './dto/requests/assign-institutional-role.request.dto';
import { RemoveInstitutionalRoleDto } from './dto/requests/remove-institutional-role.request.dto';

@ApiTags('Admin')
@Controller('admin')
@UseJwtGuard(UserRole.SUPER_ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post('institutional-roles')
  @ApiOperation({
    summary: 'Assign an institutional role (DEAN/CHAIRPERSON) to a user',
  })
  @ApiResponse({ status: 200, description: 'Role assigned successfully' })
  @ApiResponse({ status: 404, description: 'User or category not found' })
  async AssignRole(@Body() dto: AssignInstitutionalRoleDto) {
    return this.adminService.AssignInstitutionalRole(dto);
  }

  @Delete('institutional-roles')
  @ApiOperation({ summary: 'Remove an institutional role from a user' })
  @ApiResponse({ status: 200, description: 'Role removed successfully' })
  @ApiResponse({ status: 404, description: 'Role assignment not found' })
  async RemoveRole(@Body() dto: RemoveInstitutionalRoleDto) {
    return this.adminService.RemoveInstitutionalRole(dto);
  }
}
