import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { MoodleToken } from '../../entities/moodle-token.entity';
import { CommonModule } from '../common/common.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from '../../entities/user.entity';
import MoodleModule from '../moodle/moodle.module';
import DataLoaderModule from '../common/data-loaders/index.module';
import { JwtStrategy } from 'src/security/passport-strategys/jwt.strategy';
import { JwtRefreshStrategy } from 'src/security/passport-strategys/refresh-jwt.strategy';
import {
  LOGIN_STRATEGIES,
  LocalLoginStrategy,
  MoodleLoginStrategy,
} from './strategies';

@Module({
  imports: [
    MikroOrmModule.forFeature([User, MoodleToken]),
    CommonModule,
    DataLoaderModule,
    MoodleModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtRefreshStrategy,
    LocalLoginStrategy,
    MoodleLoginStrategy,
    {
      provide: LOGIN_STRATEGIES,
      useFactory: (
        localStrategy: LocalLoginStrategy,
        moodleStrategy: MoodleLoginStrategy,
      ) => [localStrategy, moodleStrategy],
      inject: [LocalLoginStrategy, MoodleLoginStrategy],
    },
  ],
  exports: [AuthService],
})
export default class AuthModule {}
