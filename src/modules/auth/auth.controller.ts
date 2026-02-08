import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseInterceptors,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginRequest } from './dto/requests/login.request.dto';
import type { AuthenticatedRequest } from '../common/interceptors/http/authenticated-request';
import { CurrentUserInterceptor } from '../common/interceptors/current-user.interceptor';
import { UseJwtGuard } from 'src/security/decorators';

@Controller('auth')
export class AuthController {
  constructor(private readonly authServivce: AuthService) {}

  @Post('login')
  async Login(@Body() body: LoginRequest) {
    return await this.authServivce.Login(body);
  }

  @Get('me')
  @UseJwtGuard()
  @UseInterceptors(CurrentUserInterceptor)
  me(@Request() request: AuthenticatedRequest) {
    return this.authServivce.Me(request.currentUser);
  }
}
