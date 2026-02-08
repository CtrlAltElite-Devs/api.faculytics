export enum MoodleEndpoint {
  LOGIN_TOKEN = '/login/token.php',
  WEBSERVICE_SERVER = '/webservice/rest/server.php',
}

export enum MoodleWebServiceFunction {
  TOKEN_SERVICE = 'moodle_mobile_app',
  GET_SITE_INFO = 'core_webservice_get_site_info',
  GET_USER_COURSES = 'core_enrol_get_users_courses',
}
