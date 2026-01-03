// Memory exports

// Types
export * from './types.js';
export * from './snapshot-types.js';

// Interfaces
export * from './interfaces.js';
export * from './platform.js';

// Storage implementations
export { LocalContextStorage } from './storage/LocalContextStorage.js';
export { TeamsContextStorage } from './storage/TeamsContextStorage.js';
export { LocalSnapshotStorage } from './storage/LocalSnapshotStorage.js';
export { HybridContextStorage } from './storage/HybridContextStorage.js';
export type { HybridStorageOptions } from './storage/HybridContextStorage.js';

// Managers
export { SnapshotManager } from './managers/SnapshotManager.js';
export { ContextManager } from './managers/ContextManager.js';
export type { ContextManagerOptions } from './managers/ContextManager.js';

// Strategies
export * from './strategies/PruningStrategy.js';

// Context loading
export { ContextFileLoader } from './ContextFileLoader.js';
export type { ContextFileConfig, LoadedContext } from './ContextFileLoader.js';

// Version
export const MEMORY_VERSION = '0.1.0';
