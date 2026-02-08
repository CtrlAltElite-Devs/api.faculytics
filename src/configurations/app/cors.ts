import { INestApplication } from "@nestjs/common";

export default function UseCorsConfigurations(app: INestApplication<any>) {
  app.enableCors({ origin: true, credentials: true });
}
