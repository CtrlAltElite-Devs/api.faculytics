import { Injectable, Scope } from '@nestjs/common';
import DataLoader from 'dataloader';
import { User } from 'src/entities/user.entity';
import { UserRepository } from 'src/repositories/user.repository';

@Injectable({ scope: Scope.REQUEST })
export class UserLoader {
  private loader: DataLoader<string, User | null>;

  constructor(private readonly userRepository: UserRepository) {
    this.loader = new DataLoader<string, User | null>(
      async (userIds: readonly string[]) => {
        const users = await this.userRepository.find(
          {
            id: { $in: [...userIds] },
          },
          {
            populate: ['campus'],
          },
        );

        const map = new Map(users.map((u) => [u.id, u]));
        return userIds.map((id) => map.get(id) ?? null);
      },
    );
  }

  load(userId: string): Promise<User | null> {
    return this.loader.load(userId);
  }
}
