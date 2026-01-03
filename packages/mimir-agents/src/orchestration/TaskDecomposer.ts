/**
 * TaskDecomposer - LLM-powered task decomposition and workflow planning
 */

import type {
  AgentRole,
  DecomposedTask,
  DecompositionOptions,
  DecompositionResult,
  WorkflowPlan,
} from '../core/roles/types.js';
import type { RoleRegistry } from '../core/roles/RoleRegistry.js';

/**
 * LLM Provider interface (simplified)
 */
interface ILLMProvider {
  chat(
    messages: any[],
    tools?: any[]
  ): Promise<{
    content: string;
    toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  }>;
}

/**
 * Task decomposition prompt templates
 */
const DECOMPOSITION_PROMPT = `You are an expert software development task planner. Analyze the following task and determine if it should be decomposed into multiple specialized sub-tasks.

Available agent roles:
{roles}

Task to analyze:
{task}

Consider:
1. Task complexity - Does this require multiple specialized skills?
2. Parallelization potential - Can parts be done concurrently?
3. Dependencies - What must be done before what?
4. Quality gates - Should security/review/testing be enforced?

Respond with a JSON object containing:
{
  "shouldDecompose": boolean,
  "reason": "explanation",
  "executionMode": "sequential" | "parallel" | "dag" | "dynamic",
  "complexity": 0-1 (estimated overall complexity),
  "tasks": [
    {
      "id": "unique-id",
      "description": "what this subtask does",
      "suggestedRole": "role-name",
      "dependsOn": ["task-id-1", "task-id-2"],
      "complexity": 0-1,
      "parallelizable": boolean
    }
  ],
  "loopPatterns": [
    {
      "pattern": ["role1", "role2", "role3"],
      "description": "what this loop achieves"
    }
  ]
}`;

/**
 * Task decomposer with LLM integration
 */
export class TaskDecomposer {
  constructor(
    private llm: ILLMProvider,
    private roleRegistry: RoleRegistry
  ) {}

  /**
   * Analyze task and create workflow plan
   */
  async analyze(task: string, options: DecompositionOptions = {}): Promise<DecompositionResult> {
    // Build decomposition prompt
    const prompt = this.buildDecompositionPrompt(task, options);

    // Call LLM
    const response = await this.llm.chat([
      {
        role: 'user',
        content: prompt,
      },
    ]);

    // Parse response
    try {
      const result = this.parseDecompositionResponse(response.content);
      return result;
    } catch (error) {
      // Fallback: create simple single-task plan
      return {
        shouldDecompose: false,
        reason: 'Failed to parse LLM response, using simple plan',
        tasks: [
          {
            id: 'task-1',
            description: task,
            suggestedRole: 'general',
            complexity: 0.5,
            parallelizable: false,
          },
        ],
      };
    }
  }

  /**
   * Generate workflow plan from task
   */
  async planWorkflow(task: string, options: DecompositionOptions = {}): Promise<WorkflowPlan> {
    const decomposition = await this.analyze(task, options);

    const plan: WorkflowPlan = {
      id: `plan-${Date.now()}`,
      task,
      description: decomposition.reason,
      tasks: decomposition.tasks,
      executionMode: this.determineExecutionMode(decomposition),
      complexity: decomposition.totalComplexity || 0.5,
    };

    // Add loop patterns if detected
    if (decomposition.tasks.length > 1) {
      const detectedPatterns = this.detectLoopPatterns(decomposition.tasks);
      // Convert to LoopPattern type
      plan.loopPatterns = detectedPatterns.map((p) => ({
        pattern: p.pattern,
        description: p.description,
        maxIterations: 5,
        breakCondition: () => false, // Will be set by runtime
      }));
    }

    return plan;
  }

  /**
   * Suggest agent roles for subtasks
   */
  suggestRoles(subtasks: DecomposedTask[]): Map<string, AgentRole> {
    const suggestions = new Map<string, AgentRole>();

    for (const subtask of subtasks) {
      const role = this.suggestRole(subtask);
      suggestions.set(subtask.id, role);
    }

    return suggestions;
  }

  /**
   * Suggest role for a single subtask
   */
  private suggestRole(subtask: DecomposedTask): AgentRole {
    // If already suggested, use it
    if (subtask.suggestedRole) {
      return subtask.suggestedRole;
    }

    const desc = subtask.description.toLowerCase();

    // Pattern-based role selection
    if (desc.includes('search') || desc.includes('find') || desc.includes('locate')) {
      return 'finder';
    }

    if (desc.includes('test') || desc.includes('spec')) {
      return 'tester';
    }

    if (desc.includes('review') || desc.includes('check quality')) {
      return 'reviewer';
    }

    if (desc.includes('security') || desc.includes('vulnerability')) {
      return 'security';
    }

    if (desc.includes('refactor') || desc.includes('improve code')) {
      return 'refactoring';
    }

    if (desc.includes('research') || desc.includes('documentation') || desc.includes('api')) {
      return 'librarian';
    }

    if (desc.includes('quick') || desc.includes('simple') || desc.includes('fix')) {
      return 'rush';
    }

    if (
      desc.includes('implement') ||
      desc.includes('design') ||
      desc.includes('complex') ||
      desc.includes('architect')
    ) {
      return 'thinker';
    }

    return 'general';
  }

  /**
   * Build decomposition prompt
   */
  private buildDecompositionPrompt(task: string, options: DecompositionOptions): string {
    // Get available roles
    const roles = options.availableRoles || this.roleRegistry.getRoles();
    const roleDescriptions = roles
      .map((role) => {
        const config = this.roleRegistry.get(role);
        return `- ${role}: ${config?.description || 'General purpose agent'}`;
      })
      .join('\n');

    let prompt = DECOMPOSITION_PROMPT.replace('{roles}', roleDescriptions).replace('{task}', task);

    // Add options guidance
    if (options.maxTasks) {
      prompt += `\n\nLimit to maximum ${options.maxTasks} subtasks.`;
    }

    if (options.preferences?.preferFewer) {
      prompt += `\n\nPrefer fewer, more comprehensive tasks over many small tasks.`;
    }

    if (options.preferences?.preferParallel) {
      prompt += `\n\nMaximize parallelization where possible.`;
    }

    return prompt;
  }

  /**
   * Parse LLM decomposition response
   */
  private parseDecompositionResponse(content: string): DecompositionResult {
    // Extract JSON from response (handles markdown code blocks)
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    // Validate structure
    if (!parsed.shouldDecompose || !parsed.tasks) {
      throw new Error('Invalid decomposition response structure');
    }

    // Calculate total complexity
    const totalComplexity =
      parsed.tasks.reduce((sum: number, t: DecomposedTask) => sum + (t.complexity || 0.5), 0) /
      parsed.tasks.length;

    return {
      shouldDecompose: parsed.shouldDecompose,
      reason: parsed.reason,
      tasks: parsed.tasks,
      plan: parsed.description,
      totalComplexity,
    };
  }

  /**
   * Determine execution mode from decomposition
   */
  private determineExecutionMode(
    decomposition: DecompositionResult
  ): 'sequential' | 'parallel' | 'dag' | 'dynamic' {
    if (decomposition.tasks.length === 1) {
      return 'sequential';
    }

    // Check if any task has dependencies
    const hasDependencies = decomposition.tasks.some((t) => t.dependsOn && t.dependsOn.length > 0);

    if (hasDependencies) {
      return 'dag';
    }

    // Check if tasks are parallelizable
    const allParallelizable = decomposition.tasks.every((t) => t.parallelizable !== false);

    if (allParallelizable) {
      return 'parallel';
    }

    // Check if loops detected (indicates dynamic workflow)
    if (decomposition.tasks.some((t) => this.isLoopTask(t))) {
      return 'dynamic';
    }

    return 'sequential';
  }

  /**
   * Check if task indicates a loop
   */
  private isLoopTask(task: DecomposedTask): boolean {
    const desc = task.description.toLowerCase();
    return (
      desc.includes('iterative') ||
      desc.includes('loop') ||
      desc.includes('until') ||
      desc.includes('retry')
    );
  }

  /**
   * Detect loop patterns in tasks
   */
  private detectLoopPatterns(tasks: DecomposedTask[]): Array<{
    pattern: AgentRole[];
    description: string;
  }> {
    const patterns: Array<{ pattern: AgentRole[]; description: string }> = [];

    // Common pattern: implement → test → review
    if (
      tasks.some((t) => t.suggestedRole === 'thinker') &&
      tasks.some((t) => t.suggestedRole === 'tester') &&
      tasks.some((t) => t.suggestedRole === 'reviewer')
    ) {
      patterns.push({
        pattern: ['thinker', 'tester', 'reviewer'],
        description: 'Iterative development with testing and review',
      });
    }

    // Pattern: refactor → test
    if (
      tasks.some((t) => t.suggestedRole === 'refactoring') &&
      tasks.some((t) => t.suggestedRole === 'tester')
    ) {
      patterns.push({
        pattern: ['refactoring', 'tester'],
        description: 'Refactoring with test validation',
      });
    }

    // Pattern: security → fix
    if (
      tasks.some((t) => t.suggestedRole === 'security') &&
      tasks.some((t) => t.suggestedRole === 'thinker')
    ) {
      patterns.push({
        pattern: ['security', 'thinker'],
        description: 'Security scan with issue remediation',
      });
    }

    return patterns;
  }

  /**
   * Validate workflow plan
   */
  validatePlan(plan: WorkflowPlan): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for circular dependencies
    const graph = this.buildDependencyGraph(plan.tasks);
    if (this.hasCycle(graph)) {
      errors.push('Circular dependency detected in task graph');
    }

    // Check for missing dependencies
    for (const task of plan.tasks) {
      if (task.dependsOn) {
        for (const depId of task.dependsOn) {
          if (!plan.tasks.find((t) => t.id === depId)) {
            errors.push(`Task ${task.id} depends on non-existent task ${depId}`);
          }
        }
      }
    }

    // Check for invalid roles
    for (const task of plan.tasks) {
      if (!this.roleRegistry.has(task.suggestedRole)) {
        errors.push(`Task ${task.id} uses invalid role: ${task.suggestedRole}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Build dependency graph
   */
  private buildDependencyGraph(tasks: DecomposedTask[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();

    for (const task of tasks) {
      graph.set(task.id, task.dependsOn || []);
    }

    return graph;
  }

  /**
   * Check for cycles in dependency graph (DFS-based)
   */
  private hasCycle(graph: Map<string, string[]>): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const dfs = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);

      const neighbors = graph.get(node) || [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          if (dfs(neighbor)) {
            return true;
          }
        } else if (recursionStack.has(neighbor)) {
          return true; // Cycle detected
        }
      }

      recursionStack.delete(node);
      return false;
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        if (dfs(node)) {
          return true;
        }
      }
    }

    return false;
  }
}
