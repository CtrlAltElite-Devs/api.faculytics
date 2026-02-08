import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { MoodleToken } from '../../entities/moodle-token.entity';
import { CommonModule } from '../common/common.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from '../../entities/user.entity';
import MoodleModule from '../moodle/moodle.module';

@Module({
  imports: [
    MikroOrmModule.forFeature([User, MoodleToken]),
    CommonModule,
    MoodleModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export default class AuthModule {}
