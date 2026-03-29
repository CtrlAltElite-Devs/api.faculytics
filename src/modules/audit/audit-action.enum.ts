export const AuditAction = {
  AUTH_LOGIN_SUCCESS: 'auth.login.success',
  AUTH_LOGIN_FAILURE: 'auth.login.failure',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_TOKEN_REFRESH: 'auth.token.refresh',
  ADMIN_SYNC_TRIGGER: 'admin.sync.trigger',
  ADMIN_SYNC_SCHEDULE_UPDATE: 'admin.sync-schedule.update',
  QUESTIONNAIRE_SUBMIT: 'questionnaire.submit',
  QUESTIONNAIRE_INGEST: 'questionnaire.ingest',
  QUESTIONNAIRE_SUBMISSIONS_WIPE: 'questionnaire.submissions.wipe',
  ANALYSIS_PIPELINE_CREATE: 'analysis.pipeline.create',
  ANALYSIS_PIPELINE_CONFIRM: 'analysis.pipeline.confirm',
  ANALYSIS_PIPELINE_CANCEL: 'analysis.pipeline.cancel',
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
