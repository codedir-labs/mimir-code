// Main entry point - re-export all modules

// Core agent exports
export { Agent, CORE_VERSION, PermissionManager, RiskAssessor } from './core/index.js';
export type {
  IAgent,
  AgentAction,
  AgentActionType,
  AgentBudget,
  AgentConfig,
  AgentContext,
  AgentObservation,
  AgentResult,
  AgentState,
  AgentStatus,
  AgentStep,
  PermissionManagerConfig,
  PermissionRequest,
  PermissionResult,
  RiskAssessment,
  AuditLogEntry,
  IAuditLogger,
} from './core/index.js';

// Memory exports
export {
  LocalContextStorage,
  TeamsContextStorage,
  LocalSnapshotStorage,
  HybridContextStorage,
  SnapshotManager,
  ContextManager,
  MEMORY_VERSION,
} from './memory/index.js';
export type {
  IContextStorage,
  ISnapshotStorage,
  PruningStrategy,
  Conversation,
  ConversationWithMessages,
  Message as MemoryMessage,
  Artifact,
  SyncQueueItem,
  SyncResult,
  Snapshot,
  HybridStorageOptions,
  ContextManagerOptions,
} from './memory/index.js';

// Tool exports
export {
  BaseTool,
  ToolRegistry,
  ReadFileTool,
  WriteFileTool,
  TOOLS_VERSION,
} from './tools/index.js';
export type {
  ITool,
  ToolResult as ToolExecutionResult,
  ToolContext,
  ToolSource,
  ToolMetadata,
  ToolDefinition,
  ToolExecutor,
  ToolConfig,
  ToolParameterSchema,
} from './tools/index.js';

// Execution exports (interfaces only - implementations in @codedir/mimir-agents-node)
export type {
  IExecutor,
  ExecutionMode,
  ExecutionConfig,
  ExecuteOptions,
  ExecuteResult,
  FileOptions,
  CloudConfig,
} from './execution/index.js';
export {
  ExecutionError,
  PermissionDeniedError as ExecutorPermissionDeniedError,
  SecurityError as ExecutorSecurityError,
} from './execution/index.js';

// Platform exports
export type {
  IFileSystem,
  IProcessExecutor,
  IDockerClient,
  ProcessExecuteOptions,
  ProcessExecuteResult,
} from './shared/platform/index.js';

// Provider exports (interfaces only)
export type { ILLMProvider, LLMTool } from './providers/ILLMProvider.js';
export {
  PROVIDER_REGISTRY,
  getAllProviders,
  getProvider,
  getModel,
  getDefaultModel,
  getProvidersByCategory,
  searchModelsByCapability,
  filterModelsByCost,
  filterModelsByQuality,
} from './providers/registry.js';
export type {
  ProviderDefinition,
  ModelDefinition,
  PricingInfo,
  ProviderCategory,
  SDKType,
  ModelCapability,
  CostTier,
} from './providers/registry.js';

// Core types
export type {
  Message,
  MessageContent,
  MessageContentPart,
  MessageMetadata,
  ToolCall,
  ToolResult,
  ChatResponse,
  ChatChunk,
  RiskLevel,
  PermissionDecision,
  Action,
  Observation,
  LLMConfig,
  PermissionsConfig,
  DockerConfig,
} from './types/index.js';

// Error types
export {
  NetworkError,
  ConfigurationError,
  PermissionDeniedError,
  ProviderError,
  RateLimitError,
} from './shared/utils/errors.js';

// Modes (placeholder)
export * from './modes/index.js';

// Orchestration (placeholder)
export * from './orchestration/index.js';

// MCP (placeholder)
export * from './mcp/index.js';
