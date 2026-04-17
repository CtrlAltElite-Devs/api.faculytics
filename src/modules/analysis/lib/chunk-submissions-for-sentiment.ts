import { QuestionnaireSubmission } from 'src/entities/questionnaire-submission.entity';

export function chunkSubmissionsForSentiment(
  submissions: QuestionnaireSubmission[],
  chunkSize: number,
): QuestionnaireSubmission[][] {
  if (chunkSize <= 0) {
    throw new Error(
      `chunkSubmissionsForSentiment requires positive chunkSize, got ${chunkSize}`,
    );
  }
  const chunks: QuestionnaireSubmission[][] = [];
  for (let i = 0; i < submissions.length; i += chunkSize) {
    chunks.push(submissions.slice(i, i + chunkSize));
  }
  return chunks;
}
