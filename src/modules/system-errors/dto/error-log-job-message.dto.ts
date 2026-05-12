export interface ErrorLogJobMessage {
  statusCode: number;
  method: string;
  path: string;
  userId?: string;
  userName?: string;
  errorName: string;
  message: string;
  stack?: string;
  requestBody?: Record<string, unknown>;
  requestQuery?: Record<string, unknown>;
  browserName?: string;
  os?: string;
  ipAddress?: string;
  occurredAt: string; // ISO timestamp
}
