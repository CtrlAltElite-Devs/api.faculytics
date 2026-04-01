import { ServiceUnavailableException } from '@nestjs/common';

// --- Mocks must be declared before any import that touches them ---

const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  const PutObjectCommand = jest.fn();
  const GetObjectCommand = jest.fn();
  const DeleteObjectCommand = jest.fn();
  const DeleteObjectsCommand = jest.fn();
  const ListObjectsV2Command = jest.fn();

  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand,
    ListObjectsV2Command,
  };
});

const mockGetSignedUrl = jest.fn();
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: mockGetSignedUrl,
}));

// Will be overridden per-describe block via a mutable reference
const envValues: Record<string, string | undefined> = {
  CF_ACCOUNT_ID: 'test-account-id',
  R2_ACCESS_KEY_ID: 'test-access-key',
  R2_SECRET_ACCESS_KEY: 'test-secret-key',
  R2_BUCKET_NAME: 'test-bucket',
};

jest.mock('src/configurations/index.config', () => ({
  get env() {
    return envValues;
  },
}));

import { R2StorageService } from './r2-storage.service';
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

describe('R2StorageService', () => {
  describe('when R2 is configured', () => {
    let service: R2StorageService;

    beforeEach(() => {
      jest.clearAllMocks();

      envValues.CF_ACCOUNT_ID = 'test-account-id';
      envValues.R2_ACCESS_KEY_ID = 'test-access-key';
      envValues.R2_SECRET_ACCESS_KEY = 'test-secret-key';
      envValues.R2_BUCKET_NAME = 'test-bucket';

      service = new R2StorageService();
    });

    describe('Upload', () => {
      it('should send PutObjectCommand with correct params', async () => {
        mockSend.mockResolvedValue({});
        const buffer = Buffer.from('pdf-content');

        await service.Upload('reports/test.pdf', buffer, 'application/pdf');

        expect(PutObjectCommand).toHaveBeenCalledWith({
          Bucket: 'test-bucket',
          Key: 'reports/test.pdf',
          Body: buffer,
          ContentType: 'application/pdf',
        });
        expect(mockSend).toHaveBeenCalledTimes(1);
      });
    });

    describe('GetPresignedUrl', () => {
      it('should call presigner with correct expiry', async () => {
        mockGetSignedUrl.mockResolvedValue('https://signed-url.example.com');

        const url = await service.GetPresignedUrl('reports/test.pdf', 3600);

        expect(GetObjectCommand).toHaveBeenCalledWith({
          Bucket: 'test-bucket',
          Key: 'reports/test.pdf',
        });
        expect(mockGetSignedUrl).toHaveBeenCalledWith(
          expect.objectContaining({ send: mockSend }),
          expect.any(Object),
          { expiresIn: 3600 },
        );
        expect(url).toBe('https://signed-url.example.com');
      });
    });

    describe('Delete', () => {
      it('should send DeleteObjectCommand with correct key', async () => {
        mockSend.mockResolvedValue({});

        await service.Delete('reports/test.pdf');

        expect(DeleteObjectCommand).toHaveBeenCalledWith({
          Bucket: 'test-bucket',
          Key: 'reports/test.pdf',
        });
        expect(mockSend).toHaveBeenCalledTimes(1);
      });
    });

    describe('DeleteByPrefix', () => {
      it('should list objects then batch-delete them', async () => {
        mockSend
          .mockResolvedValueOnce({
            Contents: [{ Key: 'reports/a.pdf' }, { Key: 'reports/b.pdf' }],
            IsTruncated: false,
          })
          .mockResolvedValueOnce({});

        await service.DeleteByPrefix('reports/');

        expect(ListObjectsV2Command).toHaveBeenCalledWith({
          Bucket: 'test-bucket',
          Prefix: 'reports/',
          ContinuationToken: undefined,
        });
        expect(DeleteObjectsCommand).toHaveBeenCalledWith({
          Bucket: 'test-bucket',
          Delete: {
            Objects: [{ Key: 'reports/a.pdf' }, { Key: 'reports/b.pdf' }],
          },
        });
      });

      it('should handle pagination with continuation token', async () => {
        mockSend
          // First page
          .mockResolvedValueOnce({
            Contents: [{ Key: 'reports/a.pdf' }],
            IsTruncated: true,
            NextContinuationToken: 'token-2',
          })
          // Delete for first page
          .mockResolvedValueOnce({})
          // Second page
          .mockResolvedValueOnce({
            Contents: [{ Key: 'reports/b.pdf' }],
            IsTruncated: false,
          })
          // Delete for second page
          .mockResolvedValueOnce({});

        await service.DeleteByPrefix('reports/');

        expect(ListObjectsV2Command).toHaveBeenCalledTimes(2);
        expect(DeleteObjectsCommand).toHaveBeenCalledTimes(2);
      });

      it('should skip delete when no objects found', async () => {
        mockSend.mockResolvedValueOnce({
          Contents: [],
          IsTruncated: false,
        });

        await service.DeleteByPrefix('empty/');

        expect(ListObjectsV2Command).toHaveBeenCalledTimes(1);
        expect(DeleteObjectsCommand).not.toHaveBeenCalled();
      });
    });
  });

  describe('when R2 is NOT configured', () => {
    let service: R2StorageService;

    beforeEach(() => {
      jest.clearAllMocks();

      envValues.CF_ACCOUNT_ID = undefined;
      envValues.R2_ACCESS_KEY_ID = undefined;
      envValues.R2_SECRET_ACCESS_KEY = undefined;
      envValues.R2_BUCKET_NAME = 'test-bucket';

      service = new R2StorageService();
    });

    it('should throw ServiceUnavailableException on Upload', async () => {
      await expect(
        service.Upload('key', Buffer.from('x'), 'application/pdf'),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('should throw ServiceUnavailableException on GetPresignedUrl', async () => {
      await expect(service.GetPresignedUrl('key', 3600)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw ServiceUnavailableException on Delete', async () => {
      await expect(service.Delete('key')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw ServiceUnavailableException on DeleteByPrefix', async () => {
      await expect(service.DeleteByPrefix('prefix/')).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
