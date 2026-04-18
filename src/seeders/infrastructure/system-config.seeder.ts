import { EntityManager } from '@mikro-orm/core';
import { Seeder } from '@mikro-orm/seeder';
import { SystemConfig } from '../../entities/system-config.entity';

export class SystemConfigSeeder extends Seeder {
  async run(em: EntityManager): Promise<void> {
    const configs = [
      {
        key: 'APP_NAME',
        value: 'faculytics',
        description: 'The name of the application.',
      },
      {
        key: 'MAINTENANCE_MODE',
        value: 'false',
        description: 'Whether the application is in maintenance mode.',
      },
      {
        key: 'MOODLE_SYNC_INTERVAL_MINUTES',
        value: '60',
        description: 'Interval for Moodle synchronization in minutes.',
      },
      {
        key: 'SENTIMENT_VLLM_CONFIG',
        value: JSON.stringify({ url: '', model: '', enabled: false }),
        description:
          'vLLM-primary sentiment classifier runtime config (URL, model, enabled).',
      },
    ];

    for (const config of configs) {
      const existing = await em.findOne(SystemConfig, { key: config.key });
      if (!existing) {
        const newConfig = new SystemConfig();
        newConfig.key = config.key;
        newConfig.value = config.value;
        newConfig.description = config.description;
        em.persist(newConfig);
      }
    }
  }
}
