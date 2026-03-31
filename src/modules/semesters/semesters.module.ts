import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Semester } from '../../entities/semester.entity';
import { SemestersController } from './semesters.controller';
import { SemestersService } from './semesters.service';

@Module({
  imports: [MikroOrmModule.forFeature([Semester])],
  controllers: [SemestersController],
  providers: [SemestersService],
})
export class SemestersModule {}
