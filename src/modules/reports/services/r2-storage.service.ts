import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from 'src/configurations/index.config';
import { StorageProvider } from '../interfaces/storage-provider.interface';

@Injectable()
export class R2StorageService extends StorageProvider {
  private readonly logger = new Logger(R2StorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly isConfigured: boolean;

  constructor() {
    super();
    this.bucket = env.R2_BUCKET_NAME;

    if (env.CF_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      });
      this.isConfigured = true;
    } else {
      this.client = null;
      this.isConfigured = false;
      this.logger.warn(
        'R2 storage not configured — report generation will be unavailable',
      );
    }
  }

  private ensureConfigured(): S3Client {
    if (!this.isConfigured || !this.client) {
      throw new ServiceUnavailableException('R2 storage is not configured');
    }
    return this.client;
  }

  async Upload(
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<void> {
    const client = this.ensureConfigured();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
  }

  async GetPresignedUrl(
    key: string,
    expiresInSeconds: number,
  ): Promise<string> {
    const client = this.ensureConfigured();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }

  async Delete(key: string): Promise<void> {
    const client = this.ensureConfigured();
    await client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async DeleteByPrefix(prefix: string): Promise<void> {
    const client = this.ensureConfigured();

    let continuationToken: string | undefined;
    do {
      const listResponse = await client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const keys = listResponse.Contents?.map((obj) => obj.Key!).filter(
        Boolean,
      );
      if (keys && keys.length > 0) {
        // S3 DeleteObjects supports max 1000 keys per call
        for (let i = 0; i < keys.length; i += 1000) {
          const batch = keys.slice(i, i + 1000);
          await client.send(
            new DeleteObjectsCommand({
              Bucket: this.bucket,
              Delete: { Objects: batch.map((Key) => ({ Key })) },
            }),
          );
        }
      }

      continuationToken = listResponse.IsTruncated
        ? listResponse.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }
}
