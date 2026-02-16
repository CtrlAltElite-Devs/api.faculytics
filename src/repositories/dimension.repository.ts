import { EntityRepository } from '@mikro-orm/postgresql';
import { Dimension } from '../entities/dimension.entity';

export class DimensionRepository extends EntityRepository<Dimension> {
  // Custom repository methods
}
