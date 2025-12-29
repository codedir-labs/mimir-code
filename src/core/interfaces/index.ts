/**
 * Core interfaces for Mimir Teams integration.
 *
 * These interfaces enable:
 * - Local mode: Works without Teams (no-op implementations)
 * - Teams mode: Full integration when authenticated
 *
 * @module core/interfaces
 */

export type { IConfigSource } from './IConfigSource.js';
export type { IAuthManager, AuthContext } from '@/features/auth/manager/IAuthManager.js';
export type { ITeamsAPIClient } from '@/features/teams/api/ITeamsAPIClient.js';
export type {
  IWorkspaceTeamDetector,
  TeamContext,
} from '@/features/teams/detector/IWorkspaceTeamDetector.js';
