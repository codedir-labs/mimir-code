/**
 * IAgent - Interface for agent implementations
 */

import type { AgentConfig, AgentContext, AgentResult, AgentState } from '../types.js';

/**
 * Agent interface - defines contract for all agent implementations
 */
export interface IAgent {
  /**
   * Unique agent identifier
   */
  readonly id: string;

  /**
   * Agent name
   */
  readonly name: string;

  /**
   * Agent role (e.g., 'finder', 'oracle', 'reviewer')
   */
  readonly role: string;

  /**
   * Execute a task
   * @param task - The task description
   * @param context - Execution context
   * @returns Execution result
   */
  execute(task: string, context?: AgentContext): Promise<AgentResult>;

  /**
   * Stop the agent execution
   */
  stop(): Promise<void>;

  /**
   * Pause the agent execution
   * @returns Current agent state snapshot
   */
  pause(): Promise<AgentState>;

  /**
   * Resume from a paused state
   * @param state - Agent state to resume from
   */
  resume(state: AgentState): Promise<void>;

  /**
   * Get current execution status
   */
  getStatus(): AgentState;

  /**
   * Update agent configuration
   * @param config - New configuration
   */
  updateConfig(config: Partial<AgentConfig>): void;
}
