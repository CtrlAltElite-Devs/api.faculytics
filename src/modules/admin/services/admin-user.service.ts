import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import * as bcrypt from 'bcrypt';
import { env } from 'src/configurations/env';
import { Campus } from 'src/entities/campus.entity';
import { User } from 'src/entities/user.entity';
import { InstitutionalRoleSource } from 'src/entities/user-institutional-role.entity';
import { AuditService } from 'src/modules/audit/audit.service';
import { AuditAction } from 'src/modules/audit/audit-action.enum';
import { CurrentUserService } from 'src/modules/common/cls/current-user.service';
import { RequestMetadataService } from 'src/modules/common/cls/request-metadata.service';
import { UserRepository } from 'src/repositories/user.repository';
import { CreateLocalUserRequestDto } from '../dto/requests/create-user.request.dto';
import { CreateLocalUserResponseDto } from '../dto/responses/create-user.response.dto';

const DEFAULT_PASSWORD = 'Head123#';

@Injectable()
export class AdminUserService {
  private readonly logger = new Logger(AdminUserService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly userRepository: UserRepository,
    private readonly auditService: AuditService,
    private readonly currentUserService: CurrentUserService,
    private readonly requestMetadataService: RequestMetadataService,
  ) {}

  async CreateLocalUser(
    dto: CreateLocalUserRequestDto,
  ): Promise<CreateLocalUserResponseDto> {
    const existingByUsername = await this.userRepository.findOne({
      userName: dto.username,
    });
    if (existingByUsername) {
      throw new ConflictException('username already exists');
    }

    let campus: Campus | null = null;
    if (dto.campusId) {
      campus = await this.em.findOne(Campus, { id: dto.campusId });
      if (!campus) {
        throw new BadRequestException('campus not found');
      }
    }

    const passwordPlain = dto.password ?? DEFAULT_PASSWORD;
    const defaultPasswordAssigned = dto.password === undefined;
    const passwordHashed = await bcrypt.hash(
      passwordPlain,
      env.JWT_BCRYPT_ROUNDS,
    );

    const fullName = `${dto.firstName} ${dto.lastName}`.trim();

    const user = this.em.create(User, {
      userName: dto.username,
      firstName: dto.firstName,
      lastName: dto.lastName,
      fullName,
      userProfilePicture: '',
      password: passwordHashed,
      campus: campus ?? undefined,
      campusSource: campus
        ? InstitutionalRoleSource.MANUAL
        : InstitutionalRoleSource.AUTO,
      departmentSource: InstitutionalRoleSource.AUTO,
      programSource: InstitutionalRoleSource.AUTO,
      roles: [],
      moodleUserId: undefined,
      isActive: true,
      lastLoginAt: new Date(),
    });
    await this.em.persistAndFlush(user);

    try {
      const actor = this.currentUserService.getOrFail();
      const requestMeta = this.requestMetadataService.get();
      await this.auditService.Emit({
        action: AuditAction.ADMIN_USER_CREATE,
        actorId: actor.id,
        actorUsername: actor.userName,
        resourceType: 'User',
        resourceId: user.id,
        metadata: {
          campusId: campus?.id ?? null,
          authMode: 'local',
          defaultPasswordAssigned,
        },
        browserName: requestMeta?.browserName,
        os: requestMeta?.os,
        ipAddress: requestMeta?.ipAddress,
      });
    } catch (err) {
      this.logger.warn(
        `Audit emit failed for local user creation: ${(err as Error).message}`,
      );
    }

    return CreateLocalUserResponseDto.FromUser(user, defaultPasswordAssigned);
  }
}
