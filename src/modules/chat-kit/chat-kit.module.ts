import { MikroOrmModule } from '@mikro-orm/nestjs';
import { Module } from '@nestjs/common';
import { ChatKitThread } from '../../entities/chatkit-thread.entity';
import { ChatKitThreadItem } from '../../entities/chatkit-thread-item.entity';
import { User } from '../../entities/user.entity';
import { ChatKitController } from './chat-kit.controller';
import { ChatKitService } from './chat-kit.service';
import { ChatKitStore } from './lib/chatkit.store';

@Module({
  imports: [
    MikroOrmModule.forFeature([ChatKitThread, ChatKitThreadItem, User]),
  ],
  controllers: [ChatKitController],
  providers: [ChatKitStore, ChatKitService],
})
export class ChatKitModule {}
