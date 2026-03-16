import { Module } from '@nestjs/common';
import UnitOfWork from './unit-of-work';
import { CustomJwtService } from './custom-jwt-service';
import { CacheService } from './cache/cache.service';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { RefreshToken } from 'src/entities/refresh-token.entity';
import { ScopeResolverService } from './services/scope-resolver.service';

@Module({
  imports: [MikroOrmModule.forFeature([RefreshToken])],
  providers: [UnitOfWork, CustomJwtService, CacheService, ScopeResolverService],
  exports: [
    UnitOfWork,
    CustomJwtService,
    MikroOrmModule,
    CacheService,
    ScopeResolverService,
  ],
})
export class CommonModule {}
