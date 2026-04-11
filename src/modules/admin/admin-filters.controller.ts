import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UseJwtGuard } from 'src/security/decorators';
import { UserRole } from '../auth/roles.enum';
import { AdminFiltersService } from './services/admin-filters.service';
import { FilterDepartmentsQueryDto } from './dto/requests/filter-departments-query.dto';
import { FilterProgramsQueryDto } from './dto/requests/filter-programs-query.dto';
import { FilterOptionResponseDto } from './dto/responses/filter-option.response.dto';
import { ProgramFilterOptionResponseDto } from './dto/responses/program-filter-option.response.dto';
import { SemesterFilterResponseDto } from './dto/responses/semester-filter.response.dto';

@ApiTags('Admin')
@Controller('admin/filters')
@UseJwtGuard(UserRole.SUPER_ADMIN)
@ApiBearerAuth()
export class AdminFiltersController {
  constructor(private readonly filtersService: AdminFiltersService) {}

  @Get('campuses')
  @ApiOperation({ summary: 'List all campuses for filter dropdowns' })
  @ApiResponse({ status: 200, type: [FilterOptionResponseDto] })
  async GetCampuses(): Promise<FilterOptionResponseDto[]> {
    return this.filtersService.GetCampuses();
  }

  @Get('semesters')
  @ApiOperation({
    summary:
      'List all semesters with computed date ranges for filter dropdowns',
  })
  @ApiResponse({ status: 200, type: [SemesterFilterResponseDto] })
  async GetSemesters(): Promise<SemesterFilterResponseDto[]> {
    return this.filtersService.GetSemesters();
  }

  @Get('departments')
  @ApiOperation({ summary: 'List departments for filter dropdowns' })
  @ApiQuery({
    name: 'campusId',
    required: false,
    type: String,
    description: 'Filter by campus UUID',
  })
  @ApiQuery({
    name: 'semesterId',
    required: false,
    type: String,
    description: 'Filter by semester UUID',
  })
  @ApiResponse({ status: 200, type: [FilterOptionResponseDto] })
  async GetDepartments(
    @Query() query: FilterDepartmentsQueryDto,
  ): Promise<FilterOptionResponseDto[]> {
    return this.filtersService.GetDepartments(query.campusId, query.semesterId);
  }

  @Get('programs')
  @ApiOperation({ summary: 'List programs for filter dropdowns' })
  @ApiQuery({
    name: 'departmentId',
    required: false,
    type: String,
    description: 'Filter by department UUID',
  })
  @ApiResponse({ status: 200, type: [ProgramFilterOptionResponseDto] })
  async GetPrograms(
    @Query() query: FilterProgramsQueryDto,
  ): Promise<ProgramFilterOptionResponseDto[]> {
    return this.filtersService.GetPrograms(query.departmentId);
  }

  @Get('roles')
  @ApiOperation({ summary: 'List available user roles for filter dropdowns' })
  @ApiResponse({
    status: 200,
    schema: {
      type: 'object',
      properties: {
        roles: {
          type: 'array',
          items: { type: 'string', enum: Object.values(UserRole) },
        },
      },
    },
  })
  GetRoles(): { roles: UserRole[] } {
    return { roles: this.filtersService.GetRoles() };
  }
}
