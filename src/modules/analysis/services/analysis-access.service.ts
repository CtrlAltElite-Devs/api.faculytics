import { Injectable, Logger } from '@nestjs/common';
import type { AnalysisPipeline } from 'src/entities/analysis-pipeline.entity';
import type { User } from 'src/entities/user.entity';
import { UserRole } from 'src/modules/auth/roles.enum';
import type { RecommendationsResponseDto } from '../dto/responses/recommendations.response.dto';

/**
 * Single enforcement point for Faculty-self-view redaction policy.
 *
 * AUDIT: verbatim redaction — if you add any endpoint returning
 * comment/quote text (topic drill-downs, theme detail endpoints, future
 * qualitative surfaces), call this helper. Frontend renders no-verbatim
 * states based on the shape of the response (empty `sampleQuotes[]`), so
 * correctness here is load-bearing for the privacy guarantee.
 *
 * Faculty-profile-id resolution (FAC-135 pre-work, documented at A10):
 * this codebase does not maintain a separate Faculty profile id. A faculty
 * user's `User.id` is the same id that `AnalysisPipeline.faculty_id` points
 * to. See `PipelineOrchestratorService.assertCanAccessPipeline` for the
 * matching precedent — `user.id === pipeline.faculty.id` is the canonical
 * ownership check in this repo. If a future refactor introduces a distinct
 * FacultyProfile entity, update BOTH paths.
 */
@Injectable()
export class AnalysisAccessService {
  private readonly logger = new Logger(AnalysisAccessService.name);

  /**
   * Strips verbatim student comments from the recommendations response
   * when the requester is the Faculty whose pipeline they are viewing.
   * Non-Faculty roles (Dean, Chairperson, Campus Head, Super Admin) see
   * the full shape regardless of any id coincidence.
   */
  RedactIfFacultySelfView(
    response: RecommendationsResponseDto,
    pipeline: AnalysisPipeline,
    requester: User,
  ): RecommendationsResponseDto {
    const requesterIsFaculty = requester.roles?.includes?.(UserRole.FACULTY);
    const pipelineFacultyId = pipeline.faculty?.id ?? null;

    if (!requesterIsFaculty) return response;
    if (!pipelineFacultyId) return response;
    if (pipelineFacultyId !== requester.id) return response;

    // Shallow copy + strip sampleQuotes on each topic source.
    const redacted: RecommendationsResponseDto = {
      ...response,
      actions: response.actions.map((action) => {
        const evidence = action.supportingEvidence;
        if (!evidence || !Array.isArray(evidence.sources)) return action;
        return {
          ...action,
          supportingEvidence: {
            ...evidence,
            sources: evidence.sources.map((source) =>
              source.type === 'topic'
                ? { ...source, sampleQuotes: [] }
                : source,
            ),
          },
        };
      }),
    };
    this.logger.debug(
      `Redacted verbatims for faculty self-view (userId=${requester.id}, pipelineId=${response.pipelineId})`,
    );
    return redacted;
  }
}
