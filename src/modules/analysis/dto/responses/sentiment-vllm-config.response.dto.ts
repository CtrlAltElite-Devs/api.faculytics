import { ApiProperty } from '@nestjs/swagger';

export class SentimentVllmConfigResponseDto {
  @ApiProperty({
    description: 'Currently configured vLLM URL. Empty string when unset.',
  })
  url: string;

  @ApiProperty({
    description: 'Currently configured vLLM model. Empty string when unset.',
  })
  model: string;

  @ApiProperty({
    description: 'Whether vLLM-first dispatch is enabled.',
  })
  enabled: boolean;

  constructor(init: { url: string; model: string; enabled: boolean }) {
    this.url = init.url;
    this.model = init.model;
    this.enabled = init.enabled;
  }
}
