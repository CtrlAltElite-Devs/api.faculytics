import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';

export class UpdateSentimentVllmConfigRequestDto {
  @ApiProperty({
    required: false,
    description:
      'Fully-qualified vLLM base URL. Must be https:// to prevent SSRF to internal services; path may include /v1/chat/completions or be omitted (the worker normalizes).',
    example: 'https://nmn5qf9j-8000.thundercompute.net',
  })
  @IsOptional()
  @IsString()
  @IsUrl({
    require_protocol: true,
    protocols: ['https'],
    require_tld: true,
  })
  url?: string;

  @ApiProperty({
    required: false,
    description: 'vLLM model identifier served by the endpoint.',
    example: 'unsloth/gemma-4-26B-A4B-it',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  model?: string;

  @ApiProperty({
    required: false,
    description:
      'When true, sentiment dispatches route to vLLM first with OpenAI fallback. When false, OpenAI-only.',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
