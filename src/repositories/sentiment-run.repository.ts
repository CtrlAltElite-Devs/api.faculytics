import { EntityRepository } from '@mikro-orm/postgresql';
import { SentimentRun } from '../entities/sentiment-run.entity';

export class SentimentRunRepository extends EntityRepository<SentimentRun> {}
