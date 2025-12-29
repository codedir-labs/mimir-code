/**
 * Main entry point for Mimir
 * Exports public API
 */

export * from './types/index.js';

// Export Agent from mimir-agents package
export { Agent } from '@codedir/mimir-agents/core';
export type {
  IAgent,
  AgentConfig,
  AgentResult,
  AgentBudget,
  AgentStatus,
} from '@codedir/mimir-agents/core';

// Export other modules
export { ToolRegistry, BaseTool } from '@codedir/mimir-agents/tools';
export type { ITool } from '@codedir/mimir-agents/tools';
export { PermissionManager, RiskAssessor } from '@codedir/mimir-agents/core';
export type {
  RiskLevel,
  RiskAssessment,
  PermissionRequest,
  PermissionResult,
} from '@codedir/mimir-agents/core';
export type { ILLMProvider } from '@codedir/mimir-agents';
export * from '@codedir/mimir-agents-node/providers';
export * from '@/shared/config/ConfigLoader.js';
export { FileSystemAdapter } from '@codedir/mimir-agents-node/platform';
export type { IFileSystem } from '@codedir/mimir-agents';
export * from '@/shared/utils/logger.js';
export * from '@/shared/utils/errors.js';
