/**
 * Agent role system types - Support for dynamic workflows, loops, and enforcement
 */

import type { AgentBudget } from '../types.js';

/**
 * Standard agent roles
 */
export type AgentRole =
  | 'finder' // Quick file searches, read-only
  | 'thinker' // Deep reasoning, complex problems
  | 'librarian' // API/docs research, read-only
  | 'refactoring' // Code refactoring, write tools
  | 'reviewer' // Security/quality review, read+git
  | 'tester' // Test generation, write+bash
  | 'rush' // Quick targeted loops, 3-5 iterations
  | 'security' // Security analysis, read+git
  | 'general'; // General purpose, all tools

/**
 * Tool access level for roles
 */
export type ToolAccessLevel = 'read-only' | 'read-write' | 'read-git' | 'read-write-bash' | 'all';

/**
 * Role configuration
 */
export interface RoleConfig {
  /**
   * Role identifier
   */
  role: AgentRole;

  /**
   * Human-readable description
   */
  description: string;

  /**
   * Recommended model for this role
   */
  recommendedModel?: string;

  /**
   * Alternative models suitable for this role
   */
  alternativeModels?: string[];

  /**
   * System prompt template for this role
   */
  systemPromptTemplate?: string;

  /**
   * Allowed tools (tool names or patterns)
   * If undefined, all tools are allowed
   */
  allowedTools?: string[];

  /**
   * Forbidden tools (tool names or patterns)
   * Takes precedence over allowedTools
   */
  forbiddenTools?: string[];

  /**
   * Tool access level (convenience field)
   * Overridden by allowedTools/forbiddenTools if specified
   */
  toolAccessLevel?: ToolAccessLevel;

  /**
   * Default budget constraints
   */
  defaultBudget?: AgentBudget;

  /**
   * Role-specific configuration
   */
  config?: Record<string, unknown>;
}

/**
 * Decomposed task specification
 */
export interface DecomposedTask {
  /**
   * Unique task identifier
   */
  id: string;

  /**
   * Task description
   */
  description: string;

  /**
   * Suggested role for this task
   */
  suggestedRole: AgentRole;

  /**
   * Task dependencies (IDs of tasks that must complete first)
   */
  dependsOn?: string[];

  /**
   * Estimated complexity (0-1)
   */
  complexity?: number;

  /**
   * Whether this task can run in parallel with others
   */
  parallelizable?: boolean;
}

/**
 * Task decomposition result
 */
export interface DecompositionResult {
  /**
   * Whether the task should be decomposed
   */
  shouldDecompose: boolean;

  /**
   * Reason for decomposition (or not)
   */
  reason: string;

  /**
   * Decomposed tasks
   */
  tasks: DecomposedTask[];

  /**
   * Overall plan description
   */
  plan?: string;

  /**
   * Estimated total complexity
   */
  totalComplexity?: number;
}

/**
 * Task decomposition options
 */
export interface DecompositionOptions {
  /**
   * Maximum number of sub-tasks
   */
  maxTasks?: number;

  /**
   * Available agent roles
   */
  availableRoles?: AgentRole[];

  /**
   * Whether to auto-detect multi-agent tasks
   */
  autoDetect?: boolean;

  /**
   * LLM model to use for decomposition
   */
  decompositionModel?: string;

  /**
   * User preferences (for approval flow)
   */
  preferences?: {
    /**
     * Prefer fewer, more complex tasks
     */
    preferFewer?: boolean;

    /**
     * Prefer more parallelization
     */
    preferParallel?: boolean;
  };
}

/**
 * Workflow-specific types for dynamic orchestration
 */

/**
 * Trigger for enforced agents
 */
export type EnforcementTrigger =
  | 'code_modification'
  | 'test_execution'
  | 'file_write'
  | 'security_scan'
  | 'always';

/**
 * When to run enforced agent
 */
export type EnforcementTiming = 'before' | 'after' | 'before_review' | 'always';

/**
 * Enforcement rule for mandatory agents
 */
export interface EnforcementRule {
  /**
   * What triggers this enforcement
   */
  trigger: EnforcementTrigger;

  /**
   * Role to enforce
   */
  role: AgentRole;

  /**
   * When to run the enforced agent
   */
  when: EnforcementTiming;

  /**
   * Whether user approval is required
   */
  requireApproval?: boolean;

  /**
   * Custom condition (evaluated at runtime)
   */
  condition?: (context: any) => boolean;
}

/**
 * Loop pattern for iterative workflows
 */
export interface LoopPattern {
  /**
   * Agent roles in loop sequence
   */
  pattern: AgentRole[];

  /**
   * Maximum loop iterations
   */
  maxIterations: number;

  /**
   * Break condition function
   */
  breakCondition: (results: Record<string, any>) => boolean;

  /**
   * Optional loop description
   */
  description?: string;
}

/**
 * Agent spawn request (for dynamic workflows)
 */
export interface SpawnRequest {
  /**
   * Role of agent to spawn
   */
  role: AgentRole;

  /**
   * Task for spawned agent
   */
  task: string;

  /**
   * Requesting agent ID
   */
  requestedBy: string;

  /**
   * Reason for spawning
   */
  reason?: string;

  /**
   * Context to pass to spawned agent
   */
  context?: Record<string, unknown>;

  /**
   * Priority (higher = spawns sooner)
   */
  priority?: number;
}

/**
 * Workflow context shared between agents
 */
export interface WorkflowContext {
  /**
   * Workflow ID
   */
  workflowId: string;

  /**
   * Shared state between agents
   */
  sharedState: {
    filesModified: string[];
    testsRun: Array<{ name: string; passed: boolean; error?: string }>;
    securityIssues: Array<{ severity: string; message: string; file?: string }>;
    reviewComments: Array<{ type: string; message: string; file?: string; line?: number }>;
    [key: string]: unknown;
  };

  /**
   * Results from completed agents
   */
  agentResults: Map<string, any>;

  /**
   * Quality gates status
   */
  qualityGates: {
    testsPass: boolean;
    securityApproved: boolean;
    reviewApproved: boolean;
    [key: string]: boolean;
  };

  /**
   * Active agent call stack (for loop detection)
   */
  callStack: Array<{ agentId: string; role: AgentRole; depth: number }>;
}

/**
 * Loop information detected in workflow
 */
export interface LoopInfo {
  /**
   * Detected loop pattern
   */
  pattern: AgentRole[];

  /**
   * Current iteration
   */
  currentIteration: number;

  /**
   * Is this an allowed loop?
   */
  isAllowed: boolean;

  /**
   * Reason (if disallowed)
   */
  reason?: string;
}

/**
 * Workflow plan generated by TaskDecomposer
 */
export interface WorkflowPlan {
  /**
   * Plan ID
   */
  id: string;

  /**
   * Original task description
   */
  task: string;

  /**
   * Workflow description
   */
  description: string;

  /**
   * Decomposed tasks
   */
  tasks: DecomposedTask[];

  /**
   * Suggested execution mode
   */
  executionMode: 'sequential' | 'parallel' | 'dag' | 'dynamic';

  /**
   * Estimated complexity (0-1)
   */
  complexity: number;

  /**
   * Estimated duration (milliseconds)
   */
  estimatedDuration?: number;

  /**
   * Enforced agents to add
   */
  enforcedAgents?: Array<{ role: AgentRole; when: EnforcementTiming }>;

  /**
   * Detected loop patterns
   */
  loopPatterns?: LoopPattern[];
}
