/**
 * Auth feature - Authentication
 * Public API exports
 */

// Commands
export { createAuthCommand } from './commands/auth.js';

// Manager
export { NoOpAuthManager } from './manager/NoOpAuthManager.js';
export type { IAuthManager } from './manager/IAuthManager.js';

// Types (placeholder)
// export type { ... } from './types.js';
