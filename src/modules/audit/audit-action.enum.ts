export const AuditAction = {
  AUTH_LOGIN_SUCCESS: 'auth.login.success',
  AUTH_LOGIN_FAILURE: 'auth.login.failure',
  AUTH_LOGOUT: 'auth.logout',
  AUTH_TOKEN_REFRESH: 'auth.token.refresh',
  ADMIN_SYNC_TRIGGER: 'admin.sync.trigger',
  ADMIN_SYNC_SCHEDULE_UPDATE: 'admin.sync-schedule.update',
  ADMIN_USER_SCOPE_UPDATE: 'admin.user.scope.update',
  ADMIN_USER_CREATE: 'admin.user.create',
  QUESTIONNAIRE_SUBMIT: 'questionnaire.submit',
  QUESTIONNAIRE_INGEST: 'questionnaire.ingest',
  QUESTIONNAIRE_SUBMISSIONS_WIPE: 'questionnaire.submissions.wipe',
  ANALYSIS_PIPELINE_CREATE: 'analysis.pipeline.create',
  ANALYSIS_PIPELINE_CONFIRM: 'analysis.pipeline.confirm',
  ANALYSIS_PIPELINE_CANCEL: 'analysis.pipeline.cancel',
  MOODLE_PROVISION_CATEGORIES: 'moodle.provision.categories',
  MOODLE_PROVISION_COURSES: 'moodle.provision.courses',
  MOODLE_PROVISION_QUICK_COURSE: 'moodle.provision.quick-course',
  MOODLE_PROVISION_USERS: 'moodle.provision.users',
  MOODLE_BULK_PROVISION_COURSES: 'moodle.provision.bulk-courses',
} as const;

export type AuditAction = (typeof AuditAction)[keyof typeof AuditAction];
