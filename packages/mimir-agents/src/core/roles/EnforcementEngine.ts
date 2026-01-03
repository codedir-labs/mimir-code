/**
 * EnforcementEngine - Enforce mandatory agents in workflows
 */

import type {
  AgentRole,
  EnforcementRule,
  EnforcementTrigger,
  EnforcementTiming,
  DecomposedTask,
  WorkflowPlan,
  WorkflowContext,
} from './types.js';
import type { RoleRegistry } from './RoleRegistry.js';

/**
 * Enforcement result
 */
export interface EnforcementResult {
  /**
   * Whether enforcement was triggered
   */
  triggered: boolean;

  /**
   * Agents to add to workflow
   */
  agentsToAdd: Array<{
    role: AgentRole;
    task: string;
    when: EnforcementTiming;
    rule: EnforcementRule;
  }>;

  /**
   * Warnings or notifications
   */
  warnings: string[];
}

/**
 * Enforcement options
 */
export interface EnforcementOptions {
  /**
   * Skip enforcement (for testing)
   */
  skipEnforcement?: boolean;

  /**
   * Require user approval for enforced agents
   */
  requireApproval?: boolean;

  /**
   * Custom enforcement rules (override registry)
   */
  customRules?: EnforcementRule[];
}

/**
 * Enforcement engine for mandatory agents
 */
export class EnforcementEngine {
  constructor(
    private roleRegistry: RoleRegistry,
    private options: EnforcementOptions = {}
  ) {}

  /**
   * Check if enforcement is triggered for a workflow plan
   */
  checkEnforcement(plan: WorkflowPlan, context: WorkflowContext): EnforcementResult {
    if (this.options.skipEnforcement) {
      return {
        triggered: false,
        agentsToAdd: [],
        warnings: [],
      };
    }

    const agentsToAdd: EnforcementResult['agentsToAdd'] = [];
    const warnings: string[] = [];

    // Get applicable enforcement rules
    const rules = this.getApplicableRules(plan, context);

    for (const rule of rules) {
      // Check if rule condition is met (if provided)
      if (rule.condition && !rule.condition(context)) {
        continue;
      }

      // Check if agent already exists in plan
      const exists = plan.tasks.some((task) => task.suggestedRole === rule.role);

      if (!exists) {
        // Add enforced agent
        agentsToAdd.push({
          role: rule.role,
          task: this.generateEnforcedTask(rule, plan),
          when: rule.when,
          rule,
        });

        if (rule.requireApproval) {
          warnings.push(`Policy requires ${rule.role} agent (${rule.when}). User approval needed.`);
        }
      }
    }

    return {
      triggered: agentsToAdd.length > 0,
      agentsToAdd,
      warnings,
    };
  }

  /**
   * Apply enforcement to workflow plan (adds enforced agents)
   */
  enforce(plan: WorkflowPlan, context: WorkflowContext): WorkflowPlan {
    const enforcement = this.checkEnforcement(plan, context);

    if (!enforcement.triggered) {
      return plan;
    }

    const beforeTasks: DecomposedTask[] = [];
    const afterTasks: DecomposedTask[] = [];
    const newTasks = [...plan.tasks];

    // Add enforced agents based on timing
    for (const enforced of enforcement.agentsToAdd) {
      const task: DecomposedTask = {
        id: `enforced-${enforced.role}-${Date.now()}`,
        description: enforced.task,
        suggestedRole: enforced.role,
        complexity: 0.3,
        parallelizable: false,
      };

      switch (enforced.when) {
        case 'before':
          // Add at beginning
          beforeTasks.push(task);
          break;

        case 'after':
          // Add at end
          afterTasks.push(task);
          break;

        case 'before_review':
          // Add before any reviewer tasks
          const reviewerIndex = newTasks.findIndex((t) => t.suggestedRole === 'reviewer');
          if (reviewerIndex >= 0 && reviewerIndex > 0) {
            const prevTaskId = newTasks[reviewerIndex - 1]?.id;
            task.dependsOn = prevTaskId ? [prevTaskId] : undefined;
          }
          beforeTasks.push(task);
          break;

        case 'always':
          // Add at end
          afterTasks.push(task);
          break;
      }
    }

    return {
      ...plan,
      tasks: [...beforeTasks, ...newTasks, ...afterTasks],
      enforcedAgents: enforcement.agentsToAdd.map((a) => ({
        role: a.role,
        when: a.when,
      })),
    };
  }

  /**
   * Get applicable enforcement rules
   */
  private getApplicableRules(plan: WorkflowPlan, _context: WorkflowContext): EnforcementRule[] {
    // Combine registry rules and custom rules
    const registryRules = this.roleRegistry.getAllEnforcementRules();
    const customRules = this.options.customRules || [];
    const allRules = [...registryRules, ...customRules];

    // Determine triggers from plan
    const triggers = this.detectTriggers(plan);

    // Filter rules by triggers
    return allRules.filter((rule) => {
      return triggers.includes(rule.trigger) || rule.trigger === 'always';
    });
  }

  /**
   * Detect triggers from workflow plan
   */
  private detectTriggers(plan: WorkflowPlan): EnforcementTrigger[] {
    const triggers: Set<EnforcementTrigger> = new Set();

    for (const task of plan.tasks) {
      // Check if task involves code modification
      if (
        task.suggestedRole === 'thinker' ||
        task.suggestedRole === 'refactoring' ||
        task.description.toLowerCase().includes('implement') ||
        task.description.toLowerCase().includes('modify') ||
        task.description.toLowerCase().includes('refactor')
      ) {
        triggers.add('code_modification');
        triggers.add('file_write');
      }

      // Check if task involves testing
      if (task.suggestedRole === 'tester' || task.description.toLowerCase().includes('test')) {
        triggers.add('test_execution');
      }

      // Check if task involves security
      if (
        task.suggestedRole === 'security' ||
        task.description.toLowerCase().includes('security') ||
        task.description.toLowerCase().includes('vulnerability')
      ) {
        triggers.add('security_scan');
      }
    }

    return Array.from(triggers);
  }

  /**
   * Generate task description for enforced agent
   */
  private generateEnforcedTask(rule: EnforcementRule, plan: WorkflowPlan): string {
    const roleDescriptions: Record<AgentRole, string> = {
      security:
        'Perform security audit of all code changes, checking for vulnerabilities and security best practices',
      reviewer: 'Review code changes for quality, correctness, and maintainability',
      tester: 'Generate and execute comprehensive tests for all modified code',
      finder: 'Search and identify relevant code files',
      thinker: 'Analyze and implement the requested changes',
      librarian: 'Research relevant documentation and APIs',
      refactoring: 'Refactor code for improved quality',
      rush: 'Quick implementation of well-defined task',
      general: 'General purpose task execution',
    };

    const taskDesc = roleDescriptions[rule.role] || `Execute ${rule.role} agent tasks`;

    // Add context from plan
    const context =
      plan.tasks.length > 0 ? ` for: ${plan.tasks[0]?.description || plan.description}` : '';

    return `${taskDesc}${context}`;
  }

  /**
   * Add custom enforcement rule
   */
  addRule(rule: EnforcementRule): void {
    if (!this.options.customRules) {
      this.options.customRules = [];
    }
    this.options.customRules.push(rule);
  }

  /**
   * Remove custom enforcement rule
   */
  removeRule(trigger: EnforcementTrigger, role: AgentRole): void {
    if (!this.options.customRules) return;

    this.options.customRules = this.options.customRules.filter(
      (rule) => !(rule.trigger === trigger && rule.role === role)
    );
  }

  /**
   * Get all enforcement rules (registry + custom)
   */
  getAllRules(): EnforcementRule[] {
    const registryRules = this.roleRegistry.getAllEnforcementRules();
    const customRules = this.options.customRules || [];
    return [...registryRules, ...customRules];
  }

  /**
   * Check if enforcement would be triggered for a specific trigger
   */
  wouldTrigger(trigger: EnforcementTrigger): boolean {
    const rules = this.roleRegistry.getEnforcementRules(trigger);
    const customRules = (this.options.customRules || []).filter(
      (r) => r.trigger === trigger || r.trigger === 'always'
    );

    return rules.length > 0 || customRules.length > 0;
  }

  /**
   * Get required agents for a trigger
   */
  getRequiredAgents(trigger: EnforcementTrigger): AgentRole[] {
    const rules = this.roleRegistry.getEnforcementRules(trigger);
    const customRules = (this.options.customRules || []).filter(
      (r) => r.trigger === trigger || r.trigger === 'always'
    );

    const allRules = [...rules, ...customRules];
    return allRules.map((r) => r.role);
  }
}
