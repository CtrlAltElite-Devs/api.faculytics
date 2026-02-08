import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';

@Injectable()
export default class UnitOfWork {
  constructor(private readonly em: EntityManager) {}

  async runInTransaction<T>(
    work: (em: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.em.transactional(work);
  }
}
