import { Injectable } from '@nestjs/common';
import { ZodError } from 'zod';

@Injectable()
export class ErrorFormatter {
  FormatZodError(error: ZodError): string {
    return error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
  }
}
