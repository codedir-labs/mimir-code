/**
 * Core agent types
 */

/**
 * Agent execution status
 */
export type AgentStatus =
  | 'idle'
  | 'reasoning'
  | 'acting'
  | 'observing'
  | 'completed'
  | 'failed'
  | 'interrupted';

/**
 * Agent action types
 */
export type AgentActionType = 'tool' | 'finish' | 'ask' | 'think';

/**
 * Agent action - represents a decision made by the agent
 */
export interface AgentAction {
  type: AgentActionType;
  tool?: string;
  input?: Record<string, unknown>;
  thought?: string;
  response?: string;
}

/**
 * Agent observation - result of an action
 */
export interface AgentObservation {
  success: boolean;
  output?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Agent execution step
 */
export interface AgentStep {
  stepNumber: number;
  timestamp: Date;
  thought: string;
  action: AgentAction;
  observation?: AgentObservation;
  tokens?: number;
  cost?: number;
}

/**
 * Agent execution result
 */
export interface AgentResult {
  success: boolean;
  status: AgentStatus;
  steps: AgentStep[];
  finalResponse?: string;
  error?: string;
  totalTokens: number;
  totalCost: number;
  duration: number; // milliseconds
}

/**
 * Agent budget constraints and resource quotas
 */
export interface AgentBudget {
  maxIterations?: number;
  maxTokens?: number;
  maxCost?: number;
  maxDuration?: number; // milliseconds
  maxMemoryMB?: number; // Maximum memory usage in MB
  maxCPUPercent?: number; // Maximum CPU usage percentage
  maxConcurrentTools?: number; // Maximum concurrent tool executions
}

/**
 * Agent configuration
 */
export interface AgentConfig {
  name?: string;
  role?: string;
  model?: string;
  temperature?: number;
  systemPrompt?: string;
  budget?: AgentBudget;
  tools?: string[]; // Tool names to enable
  enabledTools?: string[]; // Deprecated, use tools
  allowedTools?: string[]; // Deprecated, use tools
}

/**
 * Stream event types for real-time agent output
 */
export type StreamEventType =
  | 'step_start'
  | 'step_end'
  | 'thought'
  | 'action'
  | 'observation'
  | 'error'
  | 'progress';

/**
 * Stream event data
 */
export interface StreamEvent {
  type: StreamEventType;
  agentId: string;
  timestamp: Date;
  data: {
    stepNumber?: number;
    thought?: string;
    action?: AgentAction;
    observation?: AgentObservation;
    error?: string;
    progress?: {
      current: number;
      total: number;
      message: string;
    };
  };
}

/**
 * Stream callback function
 */
export type StreamCallback = (event: StreamEvent) => void | Promise<void>;

/**
 * Agent execution context
 */
export interface AgentContext {
  conversationId?: string;
  parentAgentId?: string;
  metadata?: Record<string, unknown>;
  onStream?: StreamCallback; // Optional streaming callback
}

/**
 * Agent state snapshot (for pause/resume)
 */
export interface AgentState {
  agentId: string;
  status: AgentStatus;
  currentStep: number;
  steps: AgentStep[];
  context: AgentContext;
  budget: AgentBudget;
  startTime: Date;
  totalTokens: number;
  totalCost: number;
}
