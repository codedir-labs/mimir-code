// Orchestration exports

// Orchestrator
export { AgentOrchestrator } from './AgentOrchestrator.js';
export type {
  SubAgentState,
  OrchestrationResult,
  IAgentFactory,
  TaskSpec,
} from './AgentOrchestrator.js';

// Workflow Orchestrator
export { WorkflowOrchestrator } from './WorkflowOrchestrator.js';
export type { WorkflowOptions, WorkflowResult } from './WorkflowOrchestrator.js';

// Context Manager
export { ContextManager, MODEL_CONTEXT_LIMITS } from './ContextManager.js';
export type {
  CompactionOptions,
  ScoredMessage,
  ContextStats,
  ContextScope,
  ContextSnapshot,
} from './ContextManager.js';

// Task Decomposer
export { TaskDecomposer } from './TaskDecomposer.js';

// Version
export const ORCHESTRATION_VERSION = '0.1.0';
