import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { UseJwtGuard } from 'src/security/decorators';
import { CurrentUserInterceptor } from '../common/interceptors/current-user.interceptor';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { MyEnrollmentsResponseDto } from './dto/responses/my-enrollments.response.dto';

@ApiTags('enrollments')
@Controller('enrollments')
@UseJwtGuard()
@UseInterceptors(CurrentUserInterceptor)
export class EnrollmentsController {
  constructor(private readonly enrollmentsService: EnrollmentsService) {}

  @Get('me')
  @ApiOperation({ summary: "Get current user's enrolled courses" })
  async getMyEnrollments(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ): Promise<MyEnrollmentsResponseDto> {
    return await this.enrollmentsService.getMyEnrollments(
      Number(page),
      Number(limit),
    );
  }
}
