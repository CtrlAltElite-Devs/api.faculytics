import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export default class UnitOfWork {
  private readonly logger = new Logger(UnitOfWork.name);

  constructor(private readonly em: EntityManager) {}

  async CommitChangesAsync() {
    try {
      await this.em.begin();
      await this.em.commit();
      this.logger.log(`Transaction committed successfully`);

      // todo add cache invalidation in the future
    } catch (err) {
      const error = err as unknown as Error;
      await this.em.rollback();
      this.logger.error(`Failed to commit changes: ${error?.message ?? error}`);
      throw error;
    }
  }
}
