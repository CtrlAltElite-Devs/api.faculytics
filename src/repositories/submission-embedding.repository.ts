import { EntityRepository } from '@mikro-orm/postgresql';
import { SubmissionEmbedding } from '../entities/submission-embedding.entity';

export class SubmissionEmbeddingRepository extends EntityRepository<SubmissionEmbedding> {}
