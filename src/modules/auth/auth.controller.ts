import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginRequest } from './dto/requests/login.request.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authServivce: AuthService) {}

  @Post('login')
  async Login(@Body() body: LoginRequest) {
    return await this.authServivce.Login(body);
  }
}
