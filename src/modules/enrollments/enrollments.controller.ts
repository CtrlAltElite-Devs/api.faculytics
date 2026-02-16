import {
  Controller,
  Get,
  Query,
  Request,
  UseInterceptors,
} from '@nestjs/common';
import { EnrollmentsService } from './enrollments.service';
import { UseJwtGuard } from 'src/security/decorators';
import { CurrentUserInterceptor } from '../common/interceptors/current-user.interceptor';
import type { AuthenticatedRequest } from '../common/interceptors/http/authenticated-request';
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
    @Request() request: AuthenticatedRequest,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
  ): Promise<MyEnrollmentsResponseDto> {
    return await this.enrollmentsService.getMyEnrollments(
      request.currentUser!,
      Number(page),
      Number(limit),
    );
  }
}
