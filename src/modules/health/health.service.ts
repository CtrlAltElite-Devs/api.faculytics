import { Injectable } from "@nestjs/common";

@Injectable()
export class HealthService {
  GetServerHealth() {
    return "healthy";
  }
}
