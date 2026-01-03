// Core agent exports

// Types
export * from './types.js';

// Interfaces
export type { IAgent } from './interfaces/IAgent.js';

// Agent implementation
export { Agent } from './Agent.js';
export { AgentFactory } from './AgentFactory.js';
export type { AgentFactoryOptions } from './AgentFactory.js';

// Roles
export * from './roles/index.js';

// Permissions
export * from './permissions/index.js';

// Version
export const CORE_VERSION = '0.1.0';
