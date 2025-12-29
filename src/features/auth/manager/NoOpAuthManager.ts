/**
 * No-op authentication manager for local mode.
 *
 * This implementation is used when user is not authenticated to Teams.
 * All methods either:
 * - Return null/false (for getters)
 * - Throw helpful error messages (for setters/actions)
 *
 * @example
 * ```typescript
 * const authManager = new NoOpAuthManager();
 * await authManager.isAuthenticated(); // → false
 * await authManager.getAuth(); // → null
 * await authManager.login('...', '...'); // → throws Error
 * ```
 */

import type { IAuthManager, AuthContext } from '@/features/auth/manager/IAuthManager.js';

/**
 * No-op auth manager for local mode.
 * Always returns null (not authenticated).
 */
export class NoOpAuthManager implements IAuthManager {
  /**
   * Login not supported in local mode
   * @throws Error with helpful message
   */
  async login(_email: string, _password: string, _orgSlug?: string): Promise<void> {
    throw new Error(
      'Teams features not available in local mode.\n' +
        'Mimir is running in local BYOK (Bring Your Own Key) mode.\n' +
        'To use Teams features, please contact your organization administrator.'
    );
  }

  /**
   * Logout (no-op in local mode)
   */
  async logout(_orgSlug?: string, _all?: boolean): Promise<void> {
    // No-op: Nothing to logout from
  }

  /**
   * Get auth context (always null in local mode)
   * @returns null (not authenticated)
   */
  async getAuth(_orgSlug?: string): Promise<AuthContext | null> {
    return null;
  }

  /**
   * Get active organization (always null in local mode)
   * @returns null (no active org)
   */
  async getActiveOrg(): Promise<string | null> {
    return null;
  }

  /**
   * Set active organization not supported in local mode
   * @throws Error with helpful message
   */
  async setActiveOrg(_orgSlug: string): Promise<void> {
    throw new Error('Teams features not available in local mode.');
  }

  /**
   * List organizations (always empty in local mode)
   * @returns Empty array
   */
  async listOrgs(): Promise<string[]> {
    return [];
  }

  /**
   * Refresh token (always fails in local mode)
   * @returns false (not authenticated)
   */
  async refreshToken(_orgSlug: string): Promise<boolean> {
    return false;
  }

  /**
   * Check authentication status (always false in local mode)
   * @returns false (not authenticated)
   */
  async isAuthenticated(_orgSlug?: string): Promise<boolean> {
    return false;
  }
}
