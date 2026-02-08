import { INestApplication, VersioningType } from '@nestjs/common';

export default function UseApiVersioning(app: INestApplication) {
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
}
