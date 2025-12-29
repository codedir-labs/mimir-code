/**
 * No-op team detector for local mode.
 *
 * This implementation is used when user is not authenticated to Teams.
 * Always returns null (no team detected).
 *
 * @example
 * ```typescript
 * const detector = new NoOpTeamDetector();
 * await detector.detect('acme-corp', '/path/to/workspace'); // → null
 * await detector.clearCache(); // → no-op
 * ```
 */

import type {
  IWorkspaceTeamDetector,
  TeamContext,
} from '@/features/teams/detector/IWorkspaceTeamDetector.js';

/**
 * No-op team detector for local mode.
 * Always returns null (no team).
 */
export class NoOpTeamDetector implements IWorkspaceTeamDetector {
  /**
   * Detect team (always null in local mode)
   * @returns null (no team in local mode)
   */
  async detect(_orgSlug: string, _workingDirectory: string): Promise<TeamContext | null> {
    return null; // No team in local mode
  }

  /**
   * Clear cache (no-op in local mode)
   */
  async clearCache(_workingDirectory?: string): Promise<void> {
    // No-op: No cache in local mode
  }
}
