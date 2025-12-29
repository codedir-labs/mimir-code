/**
 * Teams feature - Teams/Enterprise support
 * Public API exports
 */

// Commands
export { createTeamsCommand } from './commands/teams.js';
export { createOrgsCommand } from './commands/orgs.js';

// Detector
export { NoOpTeamDetector } from './detector/NoOpTeamDetector.js';
export type { IWorkspaceTeamDetector } from './detector/IWorkspaceTeamDetector.js';

// API
export type { ITeamsAPIClient } from './api/ITeamsAPIClient.js';

// Types (placeholder)
// export type { ... } from './types.js';
