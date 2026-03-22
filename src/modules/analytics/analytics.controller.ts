import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { UseJwtGuard } from 'src/security/decorators';
import { UserRole } from 'src/modules/auth/roles.enum';
import { CurrentUserInterceptor } from 'src/modules/common/interceptors/current-user.interceptor';
import { AnalyticsService } from './analytics.service';
import {
  DepartmentOverviewQueryDto,
  AttentionListQueryDto,
  FacultyTrendsQueryDto,
} from './dto/analytics-query.dto';
import { DepartmentOverviewResponseDto } from './dto/responses/department-overview.response.dto';
import { AttentionListResponseDto } from './dto/responses/attention-list.response.dto';
import { FacultyTrendsResponseDto } from './dto/responses/faculty-trends.response.dto';

@ApiTags('Analytics')
@Controller('analytics')
@UseJwtGuard(UserRole.DEAN, UserRole.SUPER_ADMIN)
@UseInterceptors(CurrentUserInterceptor)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get department overview with faculty stats' })
  @ApiQuery({ name: 'semesterId', required: true, type: String })
  @ApiQuery({ name: 'programCode', required: false, type: String })
  @ApiResponse({ status: 200, type: DepartmentOverviewResponseDto })
  async GetDepartmentOverview(
    @Query() query: DepartmentOverviewQueryDto,
  ): Promise<DepartmentOverviewResponseDto> {
    return this.analyticsService.GetDepartmentOverview(query.semesterId, query);
  }

  @Get('attention')
  @ApiOperation({
    summary: 'Get attention list — faculty flagged for review',
  })
  @ApiQuery({ name: 'semesterId', required: true, type: String })
  @ApiResponse({ status: 200, type: AttentionListResponseDto })
  async GetAttentionList(
    @Query() query: AttentionListQueryDto,
  ): Promise<AttentionListResponseDto> {
    return this.analyticsService.GetAttentionList(query.semesterId);
  }

  @Get('trends')
  @ApiOperation({ summary: 'Get faculty trend data across semesters' })
  @ApiQuery({ name: 'semesterId', required: false, type: String })
  @ApiQuery({ name: 'minSemesters', required: false, type: Number })
  @ApiQuery({ name: 'minR2', required: false, type: Number })
  @ApiResponse({ status: 200, type: FacultyTrendsResponseDto })
  async GetFacultyTrends(
    @Query() query: FacultyTrendsQueryDto,
  ): Promise<FacultyTrendsResponseDto> {
    return this.analyticsService.GetFacultyTrends(query);
  }
}
