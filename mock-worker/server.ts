import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { randomUUID } from 'crypto';

const app = new Hono();
const delayMs = Number(process.env.MOCK_WORKER_DELAY_MS ?? 2000);
const port = Number(process.env.PORT ?? 3001);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

app.post('/sentiment', async (c) => {
  const body = (await c.req.json()) as unknown as { jobId?: string };
  console.log(`[sentiment] Received job ${String(body.jobId)}`);

  if (delayMs > 0) await sleep(delayMs);

  const jobId = body.jobId ?? randomUUID();
  return c.json({
    jobId,
    version: '1.0',
    status: 'completed',
    result: {
      sentiment: 'positive',
      confidence: 0.92,
      topics: ['teaching_quality'],
    },
    completedAt: new Date().toISOString(),
  });
});

app.get('/health', (c) => c.json({ status: 'ok' }));

console.log(`Mock worker listening on port ${port} (delay: ${delayMs}ms)`);
serve({ fetch: app.fetch, port });
