/**
 * WorkflowOrchestrator - Enhanced orchestration with dynamic spawning,
 * context management, enforcement, and loop detection
 */

import {
  AgentOrchestrator,
  type OrchestrationResult,
  type TaskSpec,
  type SubAgentState,
} from './AgentOrchestrator.js';
import { ContextManager } from './ContextManager.js';
import { TaskDecomposer } from './TaskDecomposer.js';
import { LoopDetector, type AgentCall } from '../core/roles/LoopDetector.js';
import { EnforcementEngine } from '../core/roles/EnforcementEngine.js';
import { AgentFactory } from '../core/AgentFactory.js';
import { RoleRegistry } from '../core/roles/RoleRegistry.js';
import type { ToolRegistry } from '../tools/ToolRegistry.js';
import type { IExecutor } from '../execution/IExecutor.js';
import type {
  AgentRole,
  SpawnRequest,
  WorkflowContext,
  WorkflowPlan,
  DecompositionOptions,
} from '../core/roles/types.js';
import type { AgentConfig, AgentResult, StreamCallback } from '../core/types.js';

/**
 * LLM Provider interface
 */
interface ILLMProvider {
  chat(
    messages: any[],
    tools?: any[]
  ): Promise<{
    content: string;
    toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  }>;
  countTokens(text: string): number;
  calculateCost(inputTokens: number, outputTokens: number): number;
}

/**
 * Workflow orchestration options
 */
export interface WorkflowOptions {
  /**
   * Maximum parallel agents
   */
  maxParallel?: number;

  /**
   * Auto-detect multi-agent tasks
   */
  autoDetect?: boolean;

  /**
   * Prompt for approval before spawning agents
   */
  promptForApproval?: boolean;

  /**
   * Enable context management
   */
  enableContextManagement?: boolean;

  /**
   * Context compaction threshold (0-1)
   */
  contextThreshold?: number;

  /**
   * Enable enforcement
   */
  enableEnforcement?: boolean;

  /**
   * Enable loop detection
   */
  enableLoopDetection?: boolean;

  /**
   * Maximum workflow duration (ms)
   */
  maxDuration?: number;

  /**
   * Model for orchestrator
   */
  orchestratorModel?: string;

  /**
   * Streaming callback for events
   */
  onStream?: StreamCallback;
}

/**
 * Workflow execution result
 */
export interface WorkflowResult extends OrchestrationResult {
  /**
   * Workflow plan used
   */
  plan: WorkflowPlan;

  /**
   * Context management stats
   */
  contextStats: {
    compactionsPerformed: number;
    tokensSaved: number;
  };

  /**
   * Enforcement actions
   */
  enforcementActions: number;

  /**
   * Loops detected
   */
  loopsDetected: number;
}

/**
 * Enhanced workflow orchestrator
 */
export class WorkflowOrchestrator {
  private orchestrator: AgentOrchestrator;
  private contextManager: ContextManager;
  private taskDecomposer: TaskDecomposer;
  private loopDetector: LoopDetector;
  private enforcementEngine: EnforcementEngine;
  private agentFactory: AgentFactory;
  private roleRegistry: RoleRegistry;

  private workflowContext: WorkflowContext;
  private agentMessages: Map<string, any[]> = new Map();
  private loopMessages: Map<string, any[]> = new Map();
  private workflowMessages: any[] = [];

  constructor(
    roleRegistry: RoleRegistry,
    _toolRegistry: ToolRegistry,
    _llmProvider: ILLMProvider,
    _executor: IExecutor,
    private options: WorkflowOptions = {}
  ) {
    this.roleRegistry = roleRegistry;

    // Initialize agent factory
    this.agentFactory = new AgentFactory(roleRegistry, _toolRegistry, _llmProvider, _executor, {
      modelOverride: options.orchestratorModel,
    });

    // Initialize orchestrator
    this.orchestrator = new AgentOrchestrator(this.agentFactory as any, {
      maxParallel: options.maxParallel || 4,
    });

    // Initialize context manager
    this.contextManager = new ContextManager(options.orchestratorModel || 'claude-sonnet-4.5', {
      threshold: options.contextThreshold || 0.95,
      strategy: 'hybrid',
    });

    // Initialize task decomposer
    this.taskDecomposer = new TaskDecomposer(_llmProvider, roleRegistry);

    // Initialize loop detector
    this.loopDetector = new LoopDetector(roleRegistry, {
      maxTotalAgents: 50,
      maxNestingDepth: 10,
      maxLoopIterations: 10,
      maxNestedLoops: 3,
    });

    // Initialize enforcement engine
    this.enforcementEngine = new EnforcementEngine(roleRegistry, {
      skipEnforcement: !options.enableEnforcement,
      requireApproval: options.promptForApproval,
    });

    // Initialize workflow context
    this.workflowContext = this.createWorkflowContext();
  }

  /**
   * Execute a task dynamically (auto-decomposition)
   */
  async executeDynamic(
    task: string,
    decompositionOptions?: DecompositionOptions
  ): Promise<WorkflowResult> {
    // 1. Decompose task into workflow plan
    const plan = await this.taskDecomposer.planWorkflow(task, {
      autoDetect: this.options.autoDetect ?? true,
      ...decompositionOptions,
    });

    // 2. Apply enforcement (add mandatory agents)
    const enforcedPlan = this.enforcementEngine.enforce(plan, this.workflowContext);

    // 3. Validate plan
    const validation = this.taskDecomposer.validatePlan(enforcedPlan);
    if (!validation.valid) {
      throw new Error(`Invalid workflow plan: ${validation.errors.join(', ')}`);
    }

    // 4. Execute workflow
    return await this.executeWorkflow(enforcedPlan);
  }

  /**
   * Execute a pre-planned workflow
   */
  async executeWorkflow(plan: WorkflowPlan): Promise<WorkflowResult> {
    let compactionsPerformed = 0;
    let enforcementActions = 0;
    let loopsDetected = 0;

    try {
      // Build task specs from plan
      const taskSpecs = this.buildTaskSpecs(plan);

      // Execute based on execution mode
      let result: OrchestrationResult;

      switch (plan.executionMode) {
        case 'parallel':
          result = await this.executeParallel(taskSpecs);
          break;

        case 'sequential':
          result = await this.executeSequential(taskSpecs);
          break;

        case 'dag':
          result = await this.executeDependencyGraph(taskSpecs);
          break;

        case 'dynamic':
          result = await this.executeDynamicWorkflow(taskSpecs, plan);
          loopsDetected = this.loopDetector.getStats().activeLoops;
          break;

        default:
          result = await this.executeDependencyGraph(taskSpecs);
      }

      // Perform context management
      if (this.options.enableContextManagement) {
        const contextResult = await this.contextManager.manageMultiScale(
          this.agentMessages,
          this.loopMessages,
          this.workflowMessages,
          this.workflowContext
        );

        this.agentMessages = contextResult.agentMessages;
        this.loopMessages = contextResult.loopMessages;
        this.workflowMessages = contextResult.workflowMessages;
        compactionsPerformed = contextResult.compactionsPerformed;
      }

      const contextStatsSummary = this.contextManager.getStatsSummary();

      return {
        ...result,
        plan,
        contextStats: {
          compactionsPerformed,
          tokensSaved: contextStatsSummary.totalTokensSaved,
        },
        enforcementActions,
        loopsDetected,
      };
    } finally {
      // Cleanup
      this.loopDetector.reset();
    }
  }

  /**
   * Spawn an agent dynamically (called by running agents)
   */
  async spawnAgent(request: SpawnRequest): Promise<AgentResult> {
    // Check loop detection
    if (this.options.enableLoopDetection) {
      const loopInfo = this.loopDetector.detectLoop(request.role, this.workflowContext);

      if (loopInfo) {
        if (!this.loopDetector.isLoopAllowed(loopInfo)) {
          throw new Error(`Loop not allowed: ${loopInfo.reason}`);
        }

        // Increment loop counter
        this.loopDetector.incrementLoop(loopInfo.pattern);
      }
    }

    // Create agent call record
    const agentCall: AgentCall = {
      agentId: `${request.role}-${Date.now()}`,
      role: request.role,
      depth: this.loopDetector.getCurrentDepth(),
      parentId: request.requestedBy,
      timestamp: new Date(),
    };

    this.loopDetector.pushCall(agentCall);

    try {
      // Create agent
      const agent = this.agentFactory.createAgent(request.role);

      // Execute
      const result = await agent.execute(request.task, {
        conversationId: this.workflowContext.workflowId,
        parentAgentId: request.requestedBy,
        metadata: request.context,
        onStream: this.options.onStream,
      });

      // Store messages
      this.agentMessages.set(agentCall.agentId, []);

      // Check context and compact if needed
      if (this.options.enableContextManagement) {
        const messages = this.agentMessages.get(agentCall.agentId) || [];
        const stats = this.contextManager.calculateStats(messages);

        if (this.contextManager.shouldCompact(stats)) {
          const compacted = await this.contextManager.compactScope(
            'agent',
            agentCall.agentId,
            messages
          );
          this.agentMessages.set(agentCall.agentId, compacted);
        }
      }

      return result;
    } finally {
      this.loopDetector.popCall();
    }
  }

  /**
   * Execute tasks in parallel
   */
  private async executeParallel(taskSpecs: TaskSpec[]): Promise<OrchestrationResult> {
    const tasks = taskSpecs.map((spec) => ({
      task: spec.task,
      config: spec.config,
      context: spec.context,
    }));

    return await this.orchestrator.executeParallel(tasks);
  }

  /**
   * Execute tasks sequentially
   */
  private async executeSequential(taskSpecs: TaskSpec[]): Promise<OrchestrationResult> {
    const tasks = taskSpecs.map((spec) => ({
      task: spec.task,
      config: spec.config,
      context: spec.context,
    }));

    return await this.orchestrator.executeSequential(tasks);
  }

  /**
   * Execute tasks with dependency graph (DAG)
   */
  private async executeDependencyGraph(taskSpecs: TaskSpec[]): Promise<OrchestrationResult> {
    return await this.orchestrator.executeWithDependencies(taskSpecs);
  }

  /**
   * Execute dynamic workflow (agents can spawn other agents)
   */
  private async executeDynamicWorkflow(
    taskSpecs: TaskSpec[],
    plan: WorkflowPlan
  ): Promise<OrchestrationResult> {
    // Start with initial tasks
    let result = await this.executeDependencyGraph(taskSpecs);

    // Handle loop patterns if detected
    if (plan.loopPatterns && plan.loopPatterns.length > 0) {
      for (const loopPattern of plan.loopPatterns) {
        // Execute loop pattern
        const loopResult = await this.executeLoopPattern(loopPattern);

        // Merge results
        result.agents.push(...loopResult.agents);
        result.totalTokens += loopResult.totalTokens;
        result.totalCost += loopResult.totalCost;
        result.errors.push(...loopResult.errors);
      }
    }

    return result;
  }

  /**
   * Execute a loop pattern
   */
  private async executeLoopPattern(loopPattern: any): Promise<OrchestrationResult> {
    const agents: any[] = [];
    const errors: string[] = [];
    let totalTokens = 0;
    let totalCost = 0;
    let iteration = 0;

    const loopId = `loop-${Date.now()}`;
    this.loopDetector.enterNestedLoop();

    try {
      while (iteration < loopPattern.maxIterations) {
        iteration++;

        // Execute each agent in pattern
        for (const role of loopPattern.pattern) {
          const request: SpawnRequest = {
            role,
            task: `Execute ${role} agent (iteration ${iteration})`,
            requestedBy: 'orchestrator',
            reason: loopPattern.description,
          };

          try {
            const result = await this.spawnAgent(request);
            totalTokens += result.totalTokens;
            totalCost += result.totalCost;

            // Store in loop messages
            const messages = this.loopMessages.get(loopId) || [];
            messages.push({
              role,
              iteration,
              result,
            });
            this.loopMessages.set(loopId, messages);
          } catch (error) {
            errors.push(
              `Loop iteration ${iteration}, role ${role}: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }

        // Check break condition
        const results = this.buildLoopResults(loopPattern.pattern);
        if (loopPattern.breakCondition(results)) {
          break;
        }

        // Context management for loop
        if (this.options.enableContextManagement) {
          const messages = this.loopMessages.get(loopId) || [];
          const stats = this.contextManager.calculateStats(messages);

          if (this.contextManager.shouldCompact(stats)) {
            const compacted = await this.contextManager.compactScope('loop', loopId, messages, {
              focus: `Loop iteration ${iteration}, pattern: ${loopPattern.pattern.join(' → ')}`,
            });
            this.loopMessages.set(loopId, compacted);
          }
        }
      }
    } finally {
      this.loopDetector.exitNestedLoop();
    }

    return {
      success: errors.length === 0,
      agents,
      totalDuration: 0, // Will be calculated
      totalTokens,
      totalCost,
      errors,
    };
  }

  /**
   * Build results object for loop break condition
   */
  private buildLoopResults(pattern: AgentRole[]): Record<string, any> {
    const results: Record<string, any> = {};

    for (const role of pattern) {
      // Get latest result for this role from workflow context
      const agentResult = Array.from(this.workflowContext.agentResults.values()).find(
        (r: any) => r.role === role
      );

      if (agentResult) {
        results[role] = agentResult;
      }
    }

    return results;
  }

  /**
   * Build task specs from workflow plan
   */
  private buildTaskSpecs(plan: WorkflowPlan): TaskSpec[] {
    return plan.tasks.map((task) => {
      const config: AgentConfig = {
        name: `${task.suggestedRole}-${task.id}`,
        role: task.suggestedRole,
        budget: this.roleRegistry.get(task.suggestedRole)?.defaultBudget,
      };

      return {
        id: task.id,
        task: task.description,
        config,
        dependsOn: task.dependsOn,
        context: {
          conversationId: this.workflowContext.workflowId,
          metadata: {
            complexity: task.complexity,
            parallelizable: task.parallelizable,
          },
          onStream: this.options.onStream,
        },
      };
    });
  }

  /**
   * Create workflow context
   */
  private createWorkflowContext(): WorkflowContext {
    return {
      workflowId: `workflow-${Date.now()}`,
      sharedState: {
        filesModified: [],
        testsRun: [],
        securityIssues: [],
        reviewComments: [],
      },
      agentResults: new Map(),
      qualityGates: {
        testsPass: false,
        securityApproved: false,
        reviewApproved: false,
      },
      callStack: [],
    };
  }

  /**
   * Get workflow context
   */
  getWorkflowContext(): WorkflowContext {
    return { ...this.workflowContext };
  }

  /**
   * Get context statistics
   */
  getContextStats(): any {
    return this.contextManager.getStatsSummary();
  }

  /**
   * Get loop statistics
   */
  getLoopStats(): any {
    return this.loopDetector.getStats();
  }

  /**
   * Get all agent states for progress tracking (UI integration)
   */
  getAgents(): SubAgentState[] {
    return this.orchestrator.listAgents();
  }

  /**
   * Interrupt all running agents
   */
  async interrupt(): Promise<void> {
    const agents = this.orchestrator.listAgents();
    await Promise.all(
      agents.filter((a) => a.status === 'running').map((a) => this.orchestrator.stop(a.agentId))
    );
  }
}
