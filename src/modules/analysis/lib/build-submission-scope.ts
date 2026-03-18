import { AnalysisPipeline } from 'src/entities/analysis-pipeline.entity';

export function buildSubmissionScope(
  pipeline: AnalysisPipeline,
): Record<string, unknown> {
  const scope: Record<string, unknown> = {
    semester: pipeline.semester,
  };
  if (pipeline.faculty) scope['faculty'] = pipeline.faculty;
  if (pipeline.questionnaireVersion)
    scope['questionnaireVersion'] = pipeline.questionnaireVersion;
  if (pipeline.department) scope['department'] = pipeline.department;
  if (pipeline.program) scope['program'] = pipeline.program;
  if (pipeline.campus) scope['campus'] = pipeline.campus;
  if (pipeline.course) scope['course'] = pipeline.course;
  return scope;
}
