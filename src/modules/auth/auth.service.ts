import { Injectable, NotFoundException } from '@nestjs/common';
import { MoodleService } from '../moodle/moodle.service';
import { LoginRequest } from './dto/requests/login.request.dto';
import { MoodleSyncService } from '../moodle/moodle-sync.service';
import { MoodleTokenRepository } from '../../repositories/moodle-token.repository';
import UnitOfWork from '../common/unit-of-work';
import { JwtPayload } from '../common/custom-jwt-service/jwt-payload.dto';
import { CustomJwtService } from '../common/custom-jwt-service';
import { LoginResponse } from './dto/responses/login.response.dto';
import { User } from 'src/entities/user.entity';
import { MeResponse } from './dto/responses/me.response.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly moodleService: MoodleService,
    private readonly moodleSyncService: MoodleSyncService,
    private readonly moodleTokenRepository: MoodleTokenRepository,
    private readonly jwtService: CustomJwtService,
    private readonly unitOfWork: UnitOfWork,
  ) {}

  async Login(body: LoginRequest) {
    // login via moodle create token
    const moodleTokenResponse = await this.moodleService.Login({
      username: body.username,
      password: body.password,
    });

    // handle post login
    const user = await this.moodleSyncService.SyncUserContext(
      moodleTokenResponse.token,
    );
    await this.moodleTokenRepository.UpsertFromMoodle(
      user,
      moodleTokenResponse,
    );

    await this.unitOfWork.CommitChangesAsync();

    // return jwt
    const jwtPayload = JwtPayload.Create(user.id, user.moodleUserId);
    const signedTokens = await this.jwtService.CreateSignedTokens(jwtPayload);
    return LoginResponse.Map(signedTokens);
  }

  Me(user: User | null | undefined) {
    if (user === null || user === undefined)
      throw new NotFoundException('user not found');
    else return MeResponse.Map(user);
  }
}
