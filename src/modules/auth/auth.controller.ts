import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginRequest } from './dto/requests/login.request.dto';
import { CurrentUserInterceptor } from '../common/interceptors/current-user.interceptor';
import { Throttle, UseJwtGuard } from 'src/security/decorators';
import { MetaDataInterceptor } from '../common/interceptors/metadata.interceptor';
import { JwtRefreshGuard } from 'src/security/guards/refresh-jwt-auth.guard';
import type { RefreshTokenRequest } from '../common/interceptors/http/refresh-token-request';
import { RefreshTokenRequestBody } from './dto/requests/refresh-token.request.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseInterceptors(MetaDataInterceptor)
  async Login(@Body() body: LoginRequest) {
    return await this.authService.Login(body);
  }

  @Get('me')
  @UseJwtGuard()
  @UseInterceptors(CurrentUserInterceptor)
  me() {
    return this.authService.Me();
  }

  @Post('refresh')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseGuards(JwtRefreshGuard)
  @UseInterceptors(MetaDataInterceptor)
  async Refresh(
    @Req() request: RefreshTokenRequest,
    @Body() body: RefreshTokenRequestBody,
  ) {
    return await this.authService.RefreshToken(
      request.user!.userId,
      body.refreshToken,
    );
  }

  @Post('logout')
  @UseJwtGuard()
  @UseInterceptors(CurrentUserInterceptor)
  async Logout() {
    await this.authService.Logout();
    return { message: 'Logged out successfully' };
  }
}
