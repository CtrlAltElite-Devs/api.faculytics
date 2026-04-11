import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { EntityManager, raw } from '@mikro-orm/postgresql';
import { env } from 'src/configurations/env';
import { AnalysisPipeline } from 'src/entities/analysis-pipeline.entity';
import { QuestionnaireSubmission } from 'src/entities/questionnaire-submission.entity';
import { QuestionnaireAnswer } from 'src/entities/questionnaire-answer.entity';
import { SentimentRun } from 'src/entities/sentiment-run.entity';
import { SentimentResult } from 'src/entities/sentiment-result.entity';
import { TopicModelRun } from 'src/entities/topic-model-run.entity';
import { Topic } from 'src/entities/topic.entity';
import { TopicAssignment } from 'src/entities/topic-assignment.entity';
import { RECOMMENDATION_THRESHOLDS } from '../constants';
import { buildSubmissionScope } from '../lib/build-submission-scope';
import {
  llmRecommendationsResponseSchema,
  type LlmRecommendationItem,
  type SupportingEvidence,
  type TopicSource,
  type DimensionScoresSource,
  type RecommendedActionItem,
} from '../dto/recommendations.dto';

interface TopicData {
  topic: Topic;
  scopedCommentCount: number;
  sentimentBreakdown: { positive: number; neutral: number; negative: number };
  sampleQuotes: string[];
}

@Injectable()
export class RecommendationGenerationService {
  private readonly logger = new Logger(RecommendationGenerationService.name);
  private readonly openai: OpenAI;
  private readonly model: string;

  constructor(private readonly em: EntityManager) {
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    this.model = env.RECOMMENDATIONS_MODEL;
  }

  async Generate(pipelineId: string): Promise<RecommendedActionItem[]> {
    const fork = this.em.fork();

    // a) Gather pipeline data
    const pipeline = await fork.findOneOrFail(AnalysisPipeline, pipelineId, {
      populate: [
        'semester',
        'faculty',
        'department',
        'program',
        'campus',
        'course',
        'questionnaireVersion',
      ],
    });

    const scopeFilter = buildSubmissionScope(pipeline);
    const submissions = await fork.find(
      QuestionnaireSubmission,
      { ...scopeFilter, cleanedComment: { $ne: null } },
      { fields: ['id'] },
    );
    const submissionIds = submissions.map((s) => s.id);

    // b) Load latest runs
    const sentimentRun = await fork.findOne(
      SentimentRun,
      { pipeline: pipelineId },
      { orderBy: { createdAt: 'DESC' } },
    );

    const sentimentResults = sentimentRun
      ? await fork.find(SentimentResult, { run: sentimentRun })
      : [];

    const topicModelRun = await fork.findOne(
      TopicModelRun,
      { pipeline: pipelineId },
      { orderBy: { createdAt: 'DESC' } },
    );

    const topics = topicModelRun
      ? await fork.find(
          Topic,
          { run: topicModelRun },
          {
            orderBy: { docCount: 'DESC' },
            limit: RECOMMENDATION_THRESHOLDS.MAX_TOPICS_FOR_PROMPT,
          },
        )
      : [];

    // c) Build per-topic sentiment breakdown and sample quotes
    // F4 fix: Batch-load all topic assignments in one query
    const topicIds = topics.map((t) => t.id);
    const allAssignments =
      topicIds.length > 0
        ? await fork.find(TopicAssignment, {
            topic: { $in: topicIds },
            submission: { $in: submissionIds },
          })
        : [];

    // Build a Set for sentiment result lookups
    const sentimentBySubmission = new Map<string, SentimentResult>();
    for (const sr of sentimentResults) {
      sentimentBySubmission.set(sr.submission.id, sr);
    }

    const topicDataMap = new Map<string, TopicData>();
    for (const topic of topics) {
      const assignments = allAssignments.filter((a) => a.topic.id === topic.id);
      const assignedSubmissionIds = new Set(
        assignments.map((a) => a.submission.id),
      );

      // Cross-reference with sentiment results
      const breakdown = { positive: 0, neutral: 0, negative: 0 };
      for (const subId of assignedSubmissionIds) {
        const sr = sentimentBySubmission.get(subId);
        if (sr) {
          if (sr.label === 'positive') breakdown.positive++;
          else if (sr.label === 'neutral') breakdown.neutral++;
          else breakdown.negative++;
        }
      }

      // Select sample quotes from dominant assignments
      const dominantAssignments = assignments.filter((a) => a.isDominant);
      const dominantWithSentiment = dominantAssignments
        .map((a) => {
          const sr = sentimentBySubmission.get(a.submission.id);
          return sr
            ? {
                subId: a.submission.id,
                strength: Math.abs(
                  Number(sr.positiveScore) - Number(sr.negativeScore),
                ),
              }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.strength - a.strength)
        .slice(0, RECOMMENDATION_THRESHOLDS.MAX_SAMPLE_QUOTES);

      // Load actual comments for quotes
      const quoteSubIds = dominantWithSentiment.map((d) => d.subId);
      const quoteSubs =
        quoteSubIds.length > 0
          ? await fork.find(QuestionnaireSubmission, {
              id: { $in: quoteSubIds },
            })
          : [];
      const sampleQuotes = quoteSubs
        .map((s) => s.cleanedComment)
        .filter((c): c is string => !!c)
        .slice(0, RECOMMENDATION_THRESHOLDS.MAX_SAMPLE_QUOTES);

      const label = topic.label ?? topic.rawLabel;
      topicDataMap.set(label, {
        topic,
        scopedCommentCount: assignments.length,
        sentimentBreakdown: breakdown,
        sampleQuotes,
      });
    }

    // d) Build dimension score summary via DB aggregation
    // F1 fix: Use raw SQL column name directly via execute('get') for known result shape
    const dimensionScores: { dimensionCode: string; avgScore: number }[] = [];
    if (submissionIds.length > 0) {
      if (submissionIds.length > 1000) {
        this.logger.warn(
          `Large corpus: ${submissionIds.length} submissions for dimension score aggregation`,
        );
      }

      const results = await fork
        .createQueryBuilder(QuestionnaireAnswer, 'a')
        .select(['a.dimension_code', raw('avg(a.numeric_value) as avg_score')])
        .where({ submission: { $in: submissionIds } })
        .groupBy('a.dimension_code')
        .execute();

      for (const row of results) {
        const r = row as unknown as {
          dimension_code: string;
          avg_score: string;
        };
        dimensionScores.push({
          dimensionCode: r.dimension_code,
          avgScore: Number(r.avg_score),
        });
      }
    }

    // e) Load sample comments for prompt
    const sampleComments = await this.loadSampleComments(
      fork,
      submissionIds,
      sentimentResults,
    );

    // f) Construct LLM prompt
    const globalSentiment = { positive: 0, neutral: 0, negative: 0 };
    for (const sr of sentimentResults) {
      if (sr.label === 'positive') globalSentiment.positive++;
      else if (sr.label === 'neutral') globalSentiment.neutral++;
      else globalSentiment.negative++;
    }

    const topicDescriptions = topics
      .map((t) => {
        const label = t.label ?? t.rawLabel;
        const data = topicDataMap.get(label);
        const sentiment = data
          ? `positive=${data.sentimentBreakdown.positive}, neutral=${data.sentimentBreakdown.neutral}, negative=${data.sentimentBreakdown.negative}`
          : 'N/A';
        return `- "${label}" (keywords: [${t.keywords.join(', ')}], comments: ${data!.scopedCommentCount}, sentiment: ${sentiment})`;
      })
      .join('\n');

    const dimensionDesc = dimensionScores
      .map((d) => `- ${d.dimensionCode}: ${d.avgScore.toFixed(2)}`)
      .join('\n');

    const commentsDesc = sampleComments
      .map((c) => `- [${c.sentiment}] "${c.text}"`)
      .join('\n');

    const systemPrompt = `You are an educational analytics advisor generating faculty-level recommendations based on student feedback data.
Base recommendations on what students are telling us, not abstract AI analysis.
Generate structured recommendations that help faculty understand their strengths and areas for improvement.
Student comments may be in Cebuano, Tagalog, or English — generate all recommendations in English regardless of comment language.`;

    const userPrompt = `Analyze the following faculty evaluation data and generate 3-7 recommendations split between STRENGTH and IMPROVEMENT categories.

## Context
- Total submissions: ${pipeline.submissionCount}
- Comments analyzed: ${submissionIds.length}
- Response rate: ${(Number(pipeline.responseRate) * 100).toFixed(1)}%
- Global sentiment: positive=${globalSentiment.positive}, neutral=${globalSentiment.neutral}, negative=${globalSentiment.negative}

## Top Topics (Student Feedback Themes)
You MUST use the exact topicLabel string from the list below as your topicReference value.
${topicDescriptions || 'No topics available.'}

## Dimension Score Averages
${dimensionDesc || 'No dimension scores available.'}

## Sample Student Comments
${commentsDesc || 'No sample comments available.'}

## Instructions
- Generate 3-7 recommendations
- Split between STRENGTH (things going well) and IMPROVEMENT (areas to work on)
- Each recommendation needs:
  - headline: Short title (5-10 words)
  - description: 1-2 sentences explaining the pattern observed
  - actionPlan: 2-4 sentences with concrete steps
  - priority: HIGH, MEDIUM, or LOW
  - topicReference: The exact topic label this relates to (optional, use exact string from topic list above)
- Frame everything around student feedback: "Students report..." or "Feedback indicates..."`;

    // g) Call OpenAI — F3 fix: wrap in try/catch, log, re-throw for BullMQ retry
    let parsed: { recommendations: LlmRecommendationItem[] } | null | undefined;
    try {
      const response = await this.openai.chat.completions.parse({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: zodResponseFormat(
          llmRecommendationsResponseSchema,
          'recommendations',
        ),
      });

      parsed = response.choices[0]?.message?.parsed;
    } catch (error) {
      this.logger.error(
        `OpenAI API call failed for pipeline ${pipelineId}: ${(error as Error).message}`,
      );
      throw error;
    }

    if (!parsed) {
      throw new Error('LLM returned no parsed content for recommendations');
    }

    // h) Assemble evidence
    const dimensionScoresSource: DimensionScoresSource = {
      type: 'dimension_scores',
      scores: dimensionScores,
    };

    const result: RecommendedActionItem[] = parsed.recommendations.map(
      (rec: LlmRecommendationItem) => {
        const sources: (TopicSource | DimensionScoresSource)[] = [];

        // Match topicReference to pipeline topics
        if (rec.topicReference) {
          const topicData = topicDataMap.get(rec.topicReference);
          if (topicData) {
            const topicSource: TopicSource = {
              type: 'topic',
              topicLabel: rec.topicReference,
              commentCount: topicData.scopedCommentCount,
              sentimentBreakdown: topicData.sentimentBreakdown,
              sampleQuotes: topicData.sampleQuotes,
            };
            sources.push(topicSource);
          }
        }

        // Always attach dimension scores
        sources.push(dimensionScoresSource);

        // Compute confidence
        const evidence = this.buildEvidence(
          sources,
          rec,
          topicDataMap,
          globalSentiment,
          submissionIds.length,
        );

        return {
          category: rec.category,
          headline: rec.headline,
          description: rec.description,
          actionPlan: rec.actionPlan,
          priority: rec.priority,
          supportingEvidence: evidence,
        };
      },
    );

    this.logger.log(
      `Generated ${result.length} recommendations for pipeline ${pipelineId}`,
    );

    return result;
  }

  private buildEvidence(
    sources: (TopicSource | DimensionScoresSource)[],
    rec: LlmRecommendationItem,
    topicDataMap: Map<string, TopicData>,
    globalSentiment: { positive: number; neutral: number; negative: number },
    totalComments: number,
  ): SupportingEvidence {
    let commentCount: number;
    let sentimentBreakdown: {
      positive: number;
      neutral: number;
      negative: number;
    };

    if (rec.topicReference && topicDataMap.has(rec.topicReference)) {
      const topicData = topicDataMap.get(rec.topicReference)!;
      commentCount = topicData.scopedCommentCount;
      sentimentBreakdown = topicData.sentimentBreakdown;
    } else {
      // Fallback to pipeline-level data
      commentCount = totalComments;
      sentimentBreakdown = globalSentiment;
    }

    const confidenceLevel = this.ComputeConfidence(
      commentCount,
      sentimentBreakdown,
    );

    return {
      sources,
      confidenceLevel,
      basedOnSubmissions: totalComments,
    };
  }

  // F12 fix: >= for inclusive agreement threshold
  private ComputeConfidence(
    commentCount: number,
    sentimentBreakdown: { positive: number; neutral: number; negative: number },
  ): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (
      commentCount < RECOMMENDATION_THRESHOLDS.MEDIUM_CONFIDENCE_MIN_COMMENTS
    ) {
      return 'LOW';
    }

    const total =
      sentimentBreakdown.positive +
      sentimentBreakdown.neutral +
      sentimentBreakdown.negative;

    if (total === 0) return 'MEDIUM';

    const agreementRatio =
      Math.max(
        sentimentBreakdown.positive,
        sentimentBreakdown.neutral,
        sentimentBreakdown.negative,
      ) / total;

    if (
      commentCount >= RECOMMENDATION_THRESHOLDS.HIGH_CONFIDENCE_MIN_COMMENTS &&
      agreementRatio >= RECOMMENDATION_THRESHOLDS.HIGH_CONFIDENCE_MIN_AGREEMENT
    ) {
      return 'HIGH';
    }

    return 'MEDIUM';
  }

  // F13 fix: Proportional sample selection based on actual sentiment distribution
  private async loadSampleComments(
    em: EntityManager,
    submissionIds: string[],
    sentimentResults: SentimentResult[],
  ): Promise<{ text: string; sentiment: string }[]> {
    if (submissionIds.length === 0) return [];

    const limit = RECOMMENDATION_THRESHOLDS.MAX_SAMPLE_COMMENTS_FOR_PROMPT;

    // Group submissions by sentiment label
    const bySentiment: Record<string, string[]> = {
      positive: [],
      neutral: [],
      negative: [],
    };
    for (const sr of sentimentResults) {
      const bucket = bySentiment[sr.label] ?? bySentiment['negative'];
      bucket.push(sr.submission.id);
    }

    // Proportional selection based on actual distribution
    const totalSentiment = sentimentResults.length || 1;
    const selectedIds: { id: string; sentiment: string }[] = [];

    for (const [sentiment, ids] of Object.entries(bySentiment)) {
      const proportion = ids.length / totalSentiment;
      const take = Math.max(1, Math.round(limit * proportion));
      for (const id of ids.slice(0, take)) {
        selectedIds.push({ id, sentiment });
      }
    }

    const selectedSubIds = selectedIds.map((s) => s.id);
    if (selectedSubIds.length === 0) return [];

    const subs = await em.find(QuestionnaireSubmission, {
      id: { $in: selectedSubIds },
    });

    const subMap = new Map(subs.map((s) => [s.id, s.cleanedComment]));
    return selectedIds
      .map((s) => ({
        text: subMap.get(s.id) ?? '',
        sentiment: s.sentiment,
      }))
      .filter((c) => c.text.length > 0)
      .slice(0, limit);
  }
}
