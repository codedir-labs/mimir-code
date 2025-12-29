/**
 * Workspace team detector interface.
 *
 * Local mode: Returns null (no team detection)
 * Teams mode: Detects team from git origin
 */

/**
 * Team context detected from workspace
 */
export interface TeamContext {
  /** Team ID (UUID) */
  teamId: string;

  /** Team slug (e.g., "frontend-team") */
  teamSlug: string;

  /** Team display name */
  teamName: string;

  /** User's role in this team */
  role: 'admin' | 'developer' | 'viewer';
}

/**
 * Workspace team detector.
 *
 * Detects which team the user is working with based on:
 * 1. Current working directory
 * 2. Git repository origin URL
 * 3. User's team memberships in current organization
 *
 * Flow:
 * 1. Extract git origin from working directory
 * 2. Call backend: POST /api/v1/orgs/:slug/teams/detect { repository, userId }
 * 3. If multiple teams found, prompt user to select
 * 4. Cache selection locally in SQLite (workspace_team_mappings table)
 * 5. Return team context
 *
 * Caching:
 * - Cached in .mimir/mimir.db (workspace_team_mappings table)
 * - Cache key: (workspace, org_slug, repository)
 * - TTL: Configurable (default: 7 days)
 * - Cache invalidation: Manual via `mimir teams clear-cache`
 */
export interface IWorkspaceTeamDetector {
  /**
   * Detect team from workspace
   *
   * @param orgSlug Organization slug
   * @param workingDirectory Current working directory (absolute path)
   * @returns Team context if detected, null if no team found
   * @throws Error if network error or invalid response
   */
  detect(orgSlug: string, workingDirectory: string): Promise<TeamContext | null>;

  /**
   * Clear cached team mappings
   *
   * Useful when:
   * - User switched teams
   * - Team configuration changed
   * - Testing/debugging
   *
   * @param workingDirectory Optional: specific workspace to clear (default: all)
   */
  clearCache(workingDirectory?: string): Promise<void>;
}
