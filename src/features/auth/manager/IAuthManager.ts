/**
 * Authentication manager interface.
 *
 * Local mode: Returns null (not authenticated)
 * Teams mode: Manages auth for multiple organizations
 */

/**
 * Authentication context for a single organization
 */
export interface AuthContext {
  /** JWT access token */
  accessToken: string;

  /** JWT refresh token */
  refreshToken: string;

  /** Token expiration timestamp */
  expiresAt: Date;

  /** Organization slug (e.g., "acme-corp") */
  orgSlug: string;

  /** User ID (UUID) */
  userId: string;

  /** User's email in this organization */
  userEmail: string;

  /** Organization secret for HMAC signing (audit logs) */
  orgSecret: string;
}

/**
 * Multi-organization authentication manager.
 *
 * Supports GitHub-like multi-org workflow:
 * 1. User logs in once
 * 2. Selects organization from list
 * 3. Can switch between organizations
 * 4. Each org has separate auth tokens
 *
 * Storage:
 * - Auth data stored in ~/.mimir/auth.json
 * - Format: { organizations: { [slug]: AuthContext }, activeOrg: string }
 */
export interface IAuthManager {
  /**
   * Login to organization
   *
   * Flow:
   * 1. Call backend /api/v1/auth/login with email/password
   * 2. Receive list of organizations
   * 3. If multiple orgs, prompt user to select
   * 4. Store auth context in ~/.mimir/auth.json
   * 5. Set as active organization
   *
   * @param email User's email address
   * @param password User's password
   * @param orgSlug Optional: specific organization to login to
   * @throws Error if authentication fails
   */
  login(email: string, password: string, orgSlug?: string): Promise<void>;

  /**
   * Logout from organization (or all organizations)
   *
   * @param orgSlug Optional: specific organization to logout from (default: active org)
   * @param all If true, logout from all organizations
   */
  logout(orgSlug?: string, all?: boolean): Promise<void>;

  /**
   * Get authentication context for organization
   *
   * @param orgSlug Optional: specific organization (default: active org)
   * @returns Auth context if authenticated, null otherwise
   */
  getAuth(orgSlug?: string): Promise<AuthContext | null>;

  /**
   * Get active organization slug
   *
   * @returns Active organization slug, or null if not authenticated
   */
  getActiveOrg(): Promise<string | null>;

  /**
   * Set active organization
   *
   * @param orgSlug Organization slug to set as active
   * @throws Error if not authenticated to this organization
   */
  setActiveOrg(orgSlug: string): Promise<void>;

  /**
   * List all authenticated organizations
   *
   * @returns Array of organization slugs user is authenticated to
   */
  listOrgs(): Promise<string[]>;

  /**
   * Refresh access token for organization
   *
   * Called automatically when access token expires.
   * Uses refresh token to get new access token.
   *
   * @param orgSlug Organization slug
   * @returns true if refresh succeeded, false otherwise
   */
  refreshToken(orgSlug: string): Promise<boolean>;

  /**
   * Check if user is authenticated
   *
   * @param orgSlug Optional: specific organization (default: active org)
   * @returns true if authenticated, false otherwise
   */
  isAuthenticated(orgSlug?: string): Promise<boolean>;
}
