import { EntityManager } from '@mikro-orm/postgresql';
import { LoginRequest } from '../dto/requests/login.request.dto';
import { User } from 'src/entities/user.entity';

/**
 * Result from a login strategy execution.
 */
export interface LoginStrategyResult {
  /** The authenticated user entity */
  user: User;
  /**
   * Moodle session token (only set by MoodleLoginStrategy).
   * Available for audit logging or future features requiring Moodle API calls.
   */
  moodleToken?: string;
}

/**
 * Interface for login strategies.
 * Each strategy handles a specific authentication method (local, moodle, etc.)
 * Strategies are evaluated in priority order (lower number = higher priority).
 */
export interface LoginStrategy {
  /**
   * Priority determines evaluation order. Lower values are checked first.
   * Recommended ranges:
   * - 0-99: Core authentication (local passwords)
   * - 100-199: External providers (Moodle, LDAP, OAuth)
   * - 200+: Fallback strategies
   */
  readonly priority: number;

  /**
   * Determines if this strategy can handle the login for the given user.
   * @param localUser - The user found by username (null if not found)
   * @param body - The login request containing credentials (for future extensibility)
   * @returns true if this strategy should handle the login
   */
  CanHandle(localUser: User | null, body: LoginRequest): boolean;

  /**
   * Executes the login strategy within the provided transaction.
   * @param em - EntityManager for database operations
   * @param localUser - The user found by username (null if not found)
   * @param body - The login request containing credentials
   * @returns The authenticated user and optional moodle token
   * @throws UnauthorizedException if credentials are invalid
   */
  Execute(
    em: EntityManager,
    localUser: User | null,
    body: LoginRequest,
  ): Promise<LoginStrategyResult>;
}

export const LOGIN_STRATEGIES = Symbol('LOGIN_STRATEGIES');
