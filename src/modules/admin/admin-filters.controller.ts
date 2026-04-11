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
import { FilterCoursesQueryDto } from './dto/requests/filter-courses-query.dto';
import { FilterVersionsQueryDto } from './dto/requests/filter-versions-query.dto';
import { FilterOptionResponseDto } from './dto/responses/filter-option.response.dto';
import { FilterFacultyResponseDto } from './dto/responses/filter-faculty.response.dto';
import { FilterCourseResponseDto } from './dto/responses/filter-course.response.dto';
import { FilterVersionResponseDto } from './dto/responses/filter-version.response.dto';
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

  @Get('faculty')
  @ApiOperation({
    summary:
      'List faculty members (users with active editing teacher enrollments)',
  })
  @ApiResponse({ status: 200, type: [FilterFacultyResponseDto] })
  async GetFaculty(): Promise<FilterFacultyResponseDto[]> {
    return this.filtersService.GetFaculty();
  }

  @Get('courses')
  @ApiOperation({ summary: 'List courses for a specific faculty member' })
  @ApiQuery({
    name: 'facultyUsername',
    required: true,
    type: String,
    description: 'Faculty username to filter courses by',
  })
  @ApiResponse({ status: 200, type: [FilterCourseResponseDto] })
  async GetCourses(
    @Query() query: FilterCoursesQueryDto,
  ): Promise<FilterCourseResponseDto[]> {
    return this.filtersService.GetCoursesForFaculty(query.facultyUsername);
  }

  @Get('questionnaire-types')
  @ApiOperation({ summary: 'List all questionnaire types' })
  @ApiResponse({ status: 200, type: [FilterOptionResponseDto] })
  async GetQuestionnaireTypes(): Promise<FilterOptionResponseDto[]> {
    return this.filtersService.GetQuestionnaireTypes();
  }

  @Get('questionnaire-versions')
  @ApiOperation({ summary: 'List active versions for a questionnaire type' })
  @ApiQuery({
    name: 'typeId',
    required: true,
    type: String,
    description: 'Questionnaire type UUID',
  })
  @ApiResponse({ status: 200, type: [FilterVersionResponseDto] })
  async GetQuestionnaireVersions(
    @Query() query: FilterVersionsQueryDto,
  ): Promise<FilterVersionResponseDto[]> {
    return this.filtersService.GetQuestionnaireVersions(query.typeId);
  }
}
