import { SignedAuthenticationPayload } from 'src/modules/common/custom-jwt-service';

export class LoginResponse {
  token: string;
  refreshToken: string;

  static Map(tokens: SignedAuthenticationPayload): LoginResponse {
    return {
      token: tokens.token,
      refreshToken: tokens.refreshToken,
    };
  }
}
