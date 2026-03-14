import { EntityRepository } from '@mikro-orm/postgresql';
import { SentimentResult } from '../entities/sentiment-result.entity';

export class SentimentResultRepository extends EntityRepository<SentimentResult> {}
