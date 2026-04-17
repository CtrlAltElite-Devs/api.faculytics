import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { randomUUID } from 'crypto';

const app = new Hono();
const delayMs = Number(process.env.MOCK_WORKER_DELAY_MS ?? 2000);
const port = Number(process.env.PORT ?? 3001);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

app.post('/sentiment', async (c) => {
  const body = (await c.req.json()) as unknown as {
    jobId?: string;
    items?: { submissionId: string }[];
  };
  console.log(
    `[sentiment] Received job ${String(body.jobId)} with ${body.items?.length ?? 0} items`,
  );

  if (delayMs > 0) await sleep(delayMs);

  const jobId = body.jobId ?? randomUUID();
  const items = body.items ?? [];
  // Rotate the score buckets deterministically so smoke tests exercise the
  // sentiment gate's label branches instead of a uniform-positive stream.
  const pickBucket = (s: string): 'positive' | 'neutral' | 'negative' => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    const buckets = ['positive', 'neutral', 'negative'] as const;
    return buckets[Math.abs(h) % buckets.length];
  };
  return c.json({
    jobId,
    version: '1.0',
    status: 'completed',
    results: items.map((item) => {
      const bucket = pickBucket(item.submissionId);
      if (bucket === 'positive')
        return {
          submissionId: item.submissionId,
          positive: 0.85,
          neutral: 0.1,
          negative: 0.05,
        };
      if (bucket === 'neutral')
        return {
          submissionId: item.submissionId,
          positive: 0.2,
          neutral: 0.6,
          negative: 0.2,
        };
      return {
        submissionId: item.submissionId,
        positive: 0.05,
        neutral: 0.15,
        negative: 0.8,
      };
    }),
    completedAt: new Date().toISOString(),
  });
});

app.post('/topic-model', async (c) => {
  const body = (await c.req.json()) as unknown as {
    jobId?: string;
    items?: { submissionId: string }[];
  };
  console.log(
    `[topic-model] Received job ${String(body.jobId)} with ${body.items?.length ?? 0} items`,
  );

  if (delayMs > 0) await sleep(delayMs);

  const jobId = body.jobId ?? randomUUID();
  const items = body.items ?? [];

  return c.json({
    jobId,
    version: '1.0',
    status: 'completed',
    topics: [
      {
        topicIndex: 0,
        rawLabel: '0_teaching_quality',
        keywords: ['teaching', 'quality', 'good', 'excellent', 'method'],
        docCount: Math.ceil(items.length * 0.6),
      },
      {
        topicIndex: 1,
        rawLabel: '1_course_content',
        keywords: ['content', 'material', 'lecture', 'subject', 'topic'],
        docCount: Math.ceil(items.length * 0.3),
      },
    ],
    assignments: items.map((item, i) => ({
      submissionId: item.submissionId,
      topicIndex: i % 2,
      probability: 0.85,
    })),
    metrics: {
      npmi_coherence: 0.15,
      topic_diversity: 0.78,
      outlier_ratio: 0.1,
      silhouette_score: 0.35,
      embedding_coherence: 0.55,
    },
    outlierCount: Math.floor(items.length * 0.1),
    completedAt: new Date().toISOString(),
  });
});

app.get('/health', (c) => c.json({ status: 'ok' }));

console.log(`Mock worker listening on port ${port} (delay: ${delayMs}ms)`);
serve({ fetch: app.fetch, port });
