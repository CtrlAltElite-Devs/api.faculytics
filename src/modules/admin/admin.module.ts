import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { UserInstitutionalRole } from 'src/entities/user-institutional-role.entity';
import { User } from 'src/entities/user.entity';
import { MoodleCategory } from 'src/entities/moodle-category.entity';
import { AdminController } from './admin.controller';
import { AdminService } from './services/admin.service';

@Module({
  imports: [
    MikroOrmModule.forFeature([UserInstitutionalRole, User, MoodleCategory]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
