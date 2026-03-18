import { Module } from '@nestjs/common';
import { CurrentUserService } from './current-user.service';
import { RequestMetadataService } from './request-metadata.service';

@Module({
  providers: [CurrentUserService, RequestMetadataService],
  exports: [CurrentUserService, RequestMetadataService],
})
export class AppClsModule {}
