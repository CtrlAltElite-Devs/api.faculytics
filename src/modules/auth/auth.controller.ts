import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Request,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginRequest } from './dto/requests/login.request.dto';
import type { AuthenticatedRequest } from '../common/interceptors/http/authenticated-request';
import { CurrentUserInterceptor } from '../common/interceptors/current-user.interceptor';
import { UseJwtGuard } from 'src/security/decorators';
import { MetaDataInterceptor } from '../common/interceptors/metadata.interceptor';
import type { EnrichedRequest } from '../common/interceptors/http/enriched-request';
import { JwtRefreshGuard } from 'src/security/guards/refresh-jwt-auth.guard';
import type { RefreshTokenRequest } from '../common/interceptors/http/refresh-token-request';
import { RefreshTokenRequestBody } from './dto/requests/refresh-token.request.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseInterceptors(MetaDataInterceptor)
  async Login(@Body() body: LoginRequest, @Req() request: EnrichedRequest) {
    return await this.authService.Login(body, request.metaData);
  }

  @Get('me')
  @UseJwtGuard()
  @UseInterceptors(CurrentUserInterceptor)
  me(@Request() request: AuthenticatedRequest) {
    return this.authService.Me(request.currentUser);
  }

  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  @UseInterceptors(MetaDataInterceptor)
  async Refresh(
    @Req() request: RefreshTokenRequest & EnrichedRequest,
    @Body() body: RefreshTokenRequestBody,
  ) {
    return await this.authService.RefreshToken(
      request.user!.userId,
      body.refreshToken,
      request.metaData,
    );
  }

  @Post('logout')
  @UseJwtGuard()
  @UseInterceptors(CurrentUserInterceptor)
  async Logout(@Request() request: AuthenticatedRequest) {
    await this.authService.Logout(request.currentUser!.id);
    return { message: 'Logged out successfully' };
  }
}
