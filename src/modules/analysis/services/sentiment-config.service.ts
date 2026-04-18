import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { SystemConfig } from 'src/entities/system-config.entity';

export interface SentimentVllmConfig {
  url: string;
  model: string;
  enabled: boolean;
}

export interface UpdateResult {
  previous: SentimentVllmConfig;
  next: SentimentVllmConfig;
}

const CONFIG_KEY = 'SENTIMENT_VLLM_CONFIG';
const DEFAULT_CONFIG: SentimentVllmConfig = {
  url: '',
  model: '',
  enabled: false,
};

@Injectable()
export class SentimentConfigService {
  private readonly logger = new Logger(SentimentConfigService.name);

  constructor(private readonly em: EntityManager) {}

  async readConfig(): Promise<SentimentVllmConfig> {
    const row = await this.em.findOne(SystemConfig, { key: CONFIG_KEY });
    if (!row) {
      return { ...DEFAULT_CONFIG };
    }
    try {
      const parsed = JSON.parse(row.value) as Partial<SentimentVllmConfig>;
      return {
        url: typeof parsed.url === 'string' ? parsed.url : '',
        model: typeof parsed.model === 'string' ? parsed.model : '',
        enabled: parsed.enabled === true,
      };
    } catch (err) {
      // Upgraded from warn to error (F24): a parse failure here means
      // vLLM silently falls back to disabled. Ops needs to see this.
      this.logger.error(
        `Failed to parse SENTIMENT_VLLM_CONFIG row value; returning defaults. This disables vLLM silently — fix the row. Raw value: ${row.value}. Error: ${
          (err as Error).message
        }`,
      );
      return { ...DEFAULT_CONFIG };
    }
  }

  async updateConfig(
    patch: Partial<SentimentVllmConfig>,
  ): Promise<UpdateResult> {
    // Single authoritative read. The caller (controller) uses the returned
    // `previous` for audit — no second read, no TOCTOU window (F8 fix).
    const previous = await this.readConfig();
    const merged: SentimentVllmConfig = {
      url: patch.url !== undefined ? patch.url : previous.url,
      model: patch.model !== undefined ? patch.model : previous.model,
      enabled: patch.enabled !== undefined ? patch.enabled : previous.enabled,
    };

    if (merged.enabled) {
      if (!merged.url || merged.url.trim() === '') {
        throw new BadRequestException('Cannot enable vLLM with empty URL');
      }
      if (!merged.model || merged.model.trim() === '') {
        throw new BadRequestException('Cannot enable vLLM with empty model');
      }
    }

    const fork = this.em.fork();
    const existingRow = await fork.findOne(SystemConfig, { key: CONFIG_KEY });
    if (existingRow) {
      // Preserve any operator-edited description (F9 fix): only bump the
      // value and timestamps; leave description alone.
      existingRow.value = JSON.stringify(merged);
    } else {
      fork.persist(
        fork.create(SystemConfig, {
          key: CONFIG_KEY,
          value: JSON.stringify(merged),
          description:
            'vLLM-primary sentiment classifier runtime config (URL, model, enabled).',
        }),
      );
    }
    await fork.flush();

    return { previous, next: merged };
  }
}
