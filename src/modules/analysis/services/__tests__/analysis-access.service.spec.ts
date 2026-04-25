import { AnalysisAccessService } from '../analysis-access.service';
import { UserRole } from 'src/modules/auth/roles.enum';
import type { AnalysisPipeline } from 'src/entities/analysis-pipeline.entity';
import type { User } from 'src/entities/user.entity';
import type { RecommendationsResponseDto } from '../../dto/responses/recommendations.response.dto';
import { RunStatus } from '../../enums';

function buildResponse(
  overrides: Partial<RecommendationsResponseDto> = {},
): RecommendationsResponseDto {
  return {
    pipelineId: 'pipeline-1',
    runId: 'run-1',
    status: RunStatus.COMPLETED,
    completedAt: new Date().toISOString(),
    actions: [
      {
        id: 'action-1',
        category: 'IMPROVEMENT' as never,
        headline: 'h',
        description: 'd',
        actionPlan: 'p',
        priority: 'MEDIUM' as never,
        facet: 'inClassroom',
        supportingEvidence: {
          sources: [
            {
              type: 'topic',
              topicLabel: 'discipline',
              commentCount: 3,
              sentimentBreakdown: { positive: 1, neutral: 1, negative: 1 },
              sampleQuotes: ['raw quote 1', 'raw quote 2', 'raw quote 3'],
            },
            {
              type: 'dimension_scores',
              scores: [{ dimensionCode: 'X', avgScore: 4.2 }],
            },
          ],
          confidenceLevel: 'MEDIUM',
          basedOnSubmissions: 10,
        },
        createdAt: new Date().toISOString(),
      },
    ],
    ...overrides,
  };
}

function fakeUser(id: string, roles: UserRole[]): User {
  return { id, roles } as unknown as User;
}

function fakePipeline(facultyId: string | null): AnalysisPipeline {
  return {
    faculty: facultyId ? { id: facultyId } : undefined,
  } as unknown as AnalysisPipeline;
}

describe('AnalysisAccessService.RedactIfFacultySelfView', () => {
  const service = new AnalysisAccessService();

  it('AC11: redacts sampleQuotes when Faculty views their own pipeline', () => {
    const response = buildResponse();
    const user = fakeUser('user-1', [UserRole.FACULTY]);
    const pipeline = fakePipeline('user-1');
    const out = service.RedactIfFacultySelfView(response, pipeline, user);
    const source = out.actions[0].supportingEvidence.sources[0];
    expect(source.type).toBe('topic');
    if (source.type === 'topic') {
      expect(source.sampleQuotes).toEqual([]);
    }
  });

  it('AC12: Dean sees full sampleQuotes on the same pipeline', () => {
    const response = buildResponse();
    const user = fakeUser('dean-1', [UserRole.DEAN]);
    const pipeline = fakePipeline('user-1');
    const out = service.RedactIfFacultySelfView(response, pipeline, user);
    const source = out.actions[0].supportingEvidence.sources[0];
    if (source.type === 'topic') {
      expect(source.sampleQuotes).toHaveLength(3);
    }
  });

  it('AC13: Campus Head never gets redacted regardless of id coincidence', () => {
    const response = buildResponse();
    const user = fakeUser('campus-head-1', [UserRole.CAMPUS_HEAD]);
    // Same id shouldn't trigger redaction for non-FACULTY role.
    const pipeline = fakePipeline('campus-head-1');
    const out = service.RedactIfFacultySelfView(response, pipeline, user);
    const source = out.actions[0].supportingEvidence.sources[0];
    if (source.type === 'topic') {
      expect(source.sampleQuotes.length).toBeGreaterThan(0);
    }
  });

  it('Faculty viewing ANOTHER faculty: no redaction (auth would normally 403 upstream)', () => {
    const response = buildResponse();
    const user = fakeUser('faculty-a', [UserRole.FACULTY]);
    const pipeline = fakePipeline('faculty-b');
    const out = service.RedactIfFacultySelfView(response, pipeline, user);
    const source = out.actions[0].supportingEvidence.sources[0];
    if (source.type === 'topic') {
      expect(source.sampleQuotes.length).toBe(3);
    }
  });

  it('leaves dimension_scores sources untouched', () => {
    const response = buildResponse();
    const user = fakeUser('user-1', [UserRole.FACULTY]);
    const pipeline = fakePipeline('user-1');
    const out = service.RedactIfFacultySelfView(response, pipeline, user);
    const dim = out.actions[0].supportingEvidence.sources[1];
    expect(dim.type).toBe('dimension_scores');
  });
});
