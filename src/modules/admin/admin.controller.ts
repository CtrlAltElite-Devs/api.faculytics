import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UseJwtGuard } from 'src/security/decorators';
import { CurrentUserInterceptor } from 'src/modules/common/interceptors/current-user.interceptor';
import { MetaDataInterceptor } from 'src/modules/common/interceptors/metadata.interceptor';
import { UserRole } from '../auth/roles.enum';
import { AdminService } from './services/admin.service';
import { AdminNonSubmittersService } from './services/admin-non-submitters.service';
import { AdminUserService } from './services/admin-user.service';
import { AssignInstitutionalRoleDto } from './dto/requests/assign-institutional-role.request.dto';
import { RemoveInstitutionalRoleDto } from './dto/requests/remove-institutional-role.request.dto';
import { ListNonSubmittersQueryDto } from './dto/requests/list-non-submitters-query.dto';
import { ListUsersQueryDto } from './dto/requests/list-users-query.dto';
import { DeanEligibleCategoriesQueryDto } from './dto/requests/dean-eligible-categories-query.dto';
import { CampusHeadEligibleCategoriesQueryDto } from './dto/requests/campus-head-eligible-categories-query.dto';
import { UpdateScopeAssignmentDto } from './dto/requests/update-scope-assignment.request.dto';
import { CreateLocalUserRequestDto } from './dto/requests/create-user.request.dto';
import { AdminNonSubmitterListResponseDto } from './dto/responses/admin-non-submitter-list.response.dto';
import { AdminUserDetailResponseDto } from './dto/responses/admin-user-detail.response.dto';
import { AdminUserListResponseDto } from './dto/responses/admin-user-list.response.dto';
import { AdminUserScopeAssignmentResponseDto } from './dto/responses/admin-user-scope-assignment.response.dto';
import { DeanEligibleCategoryResponseDto } from './dto/responses/dean-eligible-category.response.dto';
import { CampusHeadEligibleCategoryResponseDto } from './dto/responses/campus-head-eligible-category.response.dto';
import { CreateLocalUserResponseDto } from './dto/responses/create-user.response.dto';

@ApiTags('Admin')
@Controller('admin')
@UseJwtGuard(UserRole.SUPER_ADMIN)
@UseInterceptors(CurrentUserInterceptor)
@ApiBearerAuth()
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly adminUserService: AdminUserService,
    private readonly adminNonSubmittersService: AdminNonSubmittersService,
  ) {}

  @Post('users')
  @UseInterceptors(MetaDataInterceptor)
  @ApiOperation({
    summary:
      'Create a Faculytics-local user (non-Moodle, bcrypt-authenticated)',
  })
  @ApiResponse({ status: 201, type: CreateLocalUserResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid username, password, or campusId',
  })
  @ApiResponse({ status: 409, description: 'Username already exists' })
  async CreateLocalUser(
    @Body() dto: CreateLocalUserRequestDto,
  ): Promise<CreateLocalUserResponseDto> {
    return this.adminUserService.CreateLocalUser(dto);
  }

  @Get('users')
  @ApiOperation({ summary: 'List users for the admin console' })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    example: 'john',
    description: 'Search by username, full name, first name, last name, or id',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: UserRole,
    example: UserRole.FACULTY,
    description: 'Filter by a role contained in the user roles array',
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    type: Boolean,
    example: true,
    description: 'Filter by active or inactive users',
  })
  @ApiQuery({
    name: 'campusId',
    required: false,
    type: String,
    example: '3f6dd1dd-8f33-4b2e-bb0b-6ac2d8bbf5d7',
    description: 'Filter by campus UUID',
  })
  @ApiQuery({
    name: 'departmentId',
    required: false,
    type: String,
    example: '9ad12fa1-6286-4461-93f8-33b48d2e5725',
    description: 'Filter by department UUID',
  })
  @ApiQuery({
    name: 'programId',
    required: false,
    type: String,
    example: 'd8be53aa-59c0-4d1f-b7c8-1e739bf6e1e2',
    description: 'Filter by program UUID',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
    description: 'Page number starting at 1',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 20,
    description: 'Items per page, max 100',
  })
  @ApiResponse({ status: 200, type: AdminUserListResponseDto })
  async ListUsers(
    @Query() query: ListUsersQueryDto,
  ): Promise<AdminUserListResponseDto> {
    return this.adminService.ListUsers(query);
  }

  @Get('users/without-submissions')
  @ApiOperation({
    summary:
      'List students with no questionnaire submissions in the scope semester',
    description:
      'Internal admin lookup. Scope defaults to the latest semester. Optional faculty/course filters narrow the pool to students enrolled in that course and treat "no submissions" as no submissions for that (faculty, course, semester) tuple.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    example: 'jane',
    description: 'Search by username, full name, first name, last name, or id',
  })
  @ApiQuery({
    name: 'semesterId',
    required: false,
    type: String,
    description: 'Scope semester UUID (defaults to latest)',
  })
  @ApiQuery({
    name: 'facultyUsername',
    required: false,
    type: String,
    description: 'Restrict to the course pool taught by this faculty username',
  })
  @ApiQuery({
    name: 'courseId',
    required: false,
    type: String,
    description: 'Restrict to students enrolled in this course UUID',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 20,
  })
  @ApiResponse({ status: 200, type: AdminNonSubmitterListResponseDto })
  async ListUsersWithoutSubmissions(
    @Query() query: ListNonSubmittersQueryDto,
  ): Promise<AdminNonSubmitterListResponseDto> {
    return this.adminNonSubmittersService.ListNonSubmitters(query);
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Get detailed information about a single user' })
  @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  @ApiResponse({ status: 200, type: AdminUserDetailResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid UUID format' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async GetUserDetail(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminUserDetailResponseDto> {
    return this.adminService.GetUserDetail(id);
  }

  @Patch('users/:id/scope-assignment')
  @ApiOperation({
    summary:
      "Update a user's department/program scope assignment (manual override)",
  })
  @ApiParam({ name: 'id', type: String, description: 'User UUID' })
  @ApiResponse({ status: 200, type: AdminUserScopeAssignmentResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Validation failed (empty body, invalid UUID, or program/department mismatch)',
  })
  @ApiResponse({
    status: 404,
    description: 'User, department, or program not found',
  })
  async UpdateUserScopeAssignment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateScopeAssignmentDto,
  ): Promise<AdminUserScopeAssignmentResponseDto> {
    return this.adminService.UpdateUserScopeAssignment(id, dto);
  }

  @Get('institutional-roles/dean-eligible-categories')
  @ApiOperation({
    summary: 'List eligible department categories for DEAN promotion',
  })
  @ApiQuery({
    name: 'userId',
    required: true,
    type: String,
    description: 'UUID of the user to check eligibility for',
  })
  @ApiResponse({ status: 200, type: [DeanEligibleCategoryResponseDto] })
  @ApiResponse({ status: 404, description: 'User not found' })
  async GetDeanEligibleCategories(
    @Query() query: DeanEligibleCategoriesQueryDto,
  ): Promise<DeanEligibleCategoryResponseDto[]> {
    return this.adminService.GetDeanEligibleCategories(query.userId);
  }

  @Get('institutional-roles/campus-head-eligible-categories')
  @ApiOperation({
    summary:
      'List depth-1 Moodle categories a user can be promoted to as Campus Head',
  })
  @ApiQuery({
    name: 'userId',
    required: true,
    type: String,
    description: 'UUID of the user to check eligibility for',
  })
  @ApiResponse({
    status: 200,
    type: [CampusHeadEligibleCategoryResponseDto],
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async GetCampusHeadEligibleCategories(
    @Query() query: CampusHeadEligibleCategoriesQueryDto,
  ): Promise<CampusHeadEligibleCategoryResponseDto[]> {
    return this.adminService.GetCampusHeadEligibleCategories(query.userId);
  }

  @Post('institutional-roles')
  @ApiOperation({
    summary:
      'Assign an institutional role (DEAN/CHAIRPERSON/CAMPUS_HEAD) to a user',
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
