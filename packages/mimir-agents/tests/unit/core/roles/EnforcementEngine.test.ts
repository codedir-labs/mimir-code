/**
 * EnforcementEngine tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { EnforcementEngine } from '../../../../src/core/roles/EnforcementEngine.js';
import { RoleRegistry } from '../../../../src/core/roles/RoleRegistry.js';
import type {
  WorkflowPlan,
  WorkflowContext,
  EnforcementRule,
} from '../../../../src/core/roles/types.js';

describe('EnforcementEngine', () => {
  let engine: EnforcementEngine;
  let roleRegistry: RoleRegistry;
  let workflowContext: WorkflowContext;

  beforeEach(() => {
    roleRegistry = new RoleRegistry();
    engine = new EnforcementEngine(roleRegistry);

    workflowContext = {
      workflowId: 'test-workflow',
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
  });

  describe('trigger detection', () => {
    it('should detect code_modification trigger', () => {
      const plan: WorkflowPlan = {
        id: 'plan-1',
        task: 'Implement login feature',
        description: 'Create login functionality',
        tasks: [
          {
            id: 'task-1',
            description: 'Implement login logic',
            suggestedRole: 'thinker',
            complexity: 0.7,
          },
        ],
        executionMode: 'sequential',
        complexity: 0.7,
      };

      const result = engine.checkEnforcement(plan, workflowContext);

      // Should trigger based on 'implement' in description
      expect(result.triggered).toBe(false); // No enforcement rules by default
    });

    it('should detect test_execution trigger', () => {
      const plan: WorkflowPlan = {
        id: 'plan-1',
        task: 'Run tests',
        description: 'Execute test suite',
        tasks: [
          {
            id: 'task-1',
            description: 'Run unit tests',
            suggestedRole: 'tester',
            complexity: 0.5,
          },
        ],
        executionMode: 'sequential',
        complexity: 0.5,
      };

      const result = engine.checkEnforcement(plan, workflowContext);
      expect(result.triggered).toBe(false); // No enforcement rules
    });
  });

  describe('enforcement rules', () => {
    it('should add enforced agents to workflow', () => {
      // Add enforcement rule
      engine.addRule({
        trigger: 'code_modification',
        role: 'security',
        when: 'after',
      });

      const plan: WorkflowPlan = {
        id: 'plan-1',
        task: 'Modify code',
        description: 'Refactor authentication',
        tasks: [
          {
            id: 'task-1',
            description: 'Refactor auth module',
            suggestedRole: 'refactoring',
            complexity: 0.6,
          },
        ],
        executionMode: 'sequential',
        complexity: 0.6,
      };

      const enforced = engine.enforce(plan, workflowContext);

      expect(enforced.tasks.length).toBeGreaterThan(plan.tasks.length);
      expect(enforced.tasks.some((t) => t.suggestedRole === 'security')).toBe(true);
    });

    it('should not duplicate agents already in plan', () => {
      engine.addRule({
        trigger: 'code_modification',
        role: 'security',
        when: 'after',
      });

      const plan: WorkflowPlan = {
        id: 'plan-1',
        task: 'Secure code',
        description: 'Implement security features',
        tasks: [
          {
            id: 'task-1',
            description: 'Add security checks',
            suggestedRole: 'thinker',
            complexity: 0.6,
          },
          {
            id: 'task-2',
            description: 'Security audit',
            suggestedRole: 'security',
            complexity: 0.4,
          },
        ],
        executionMode: 'sequential',
        complexity: 0.5,
      };

      const enforced = engine.enforce(plan, workflowContext);

      const securityTasks = enforced.tasks.filter((t) => t.suggestedRole === 'security');
      expect(securityTasks).toHaveLength(1); // Should not duplicate
    });

    it('should respect enforcement timing (before)', () => {
      engine.addRule({
        trigger: 'code_modification',
        role: 'security',
        when: 'before',
      });

      const plan: WorkflowPlan = {
        id: 'plan-1',
        task: 'Modify code',
        description: 'Implement feature',
        tasks: [
          {
            id: 'task-1',
            description: 'Implement new feature',
            suggestedRole: 'thinker',
            complexity: 0.6,
          },
        ],
        executionMode: 'sequential',
        complexity: 0.6,
      };

      const enforced = engine.enforce(plan, workflowContext);

      // Security task should be added at the beginning
      expect(enforced.tasks[0]?.suggestedRole).toBe('security');
    });

    it('should respect enforcement timing (after)', () => {
      engine.addRule({
        trigger: 'code_modification',
        role: 'security',
        when: 'after',
      });

      const plan: WorkflowPlan = {
        id: 'plan-1',
        task: 'Modify code',
        description: 'Implement feature',
        tasks: [
          {
            id: 'task-1',
            description: 'Implement new feature',
            suggestedRole: 'thinker',
            complexity: 0.6,
          },
        ],
        executionMode: 'sequential',
        complexity: 0.6,
      };

      const enforced = engine.enforce(plan, workflowContext);

      // Security task should be added at the end
      const lastTask = enforced.tasks[enforced.tasks.length - 1];
      expect(lastTask?.suggestedRole).toBe('security');
    });
  });

  describe('custom enforcement rules', () => {
    it('should use custom rules', () => {
      const customEngine = new EnforcementEngine(roleRegistry, {
        customRules: [
          {
            trigger: 'always',
            role: 'reviewer',
            when: 'after',
          },
        ],
      });

      const plan: WorkflowPlan = {
        id: 'plan-1',
        task: 'Any task',
        description: 'Do something',
        tasks: [
          {
            id: 'task-1',
            description: 'Simple task',
            suggestedRole: 'general',
            complexity: 0.3,
          },
        ],
        executionMode: 'sequential',
        complexity: 0.3,
      };

      const result = customEngine.checkEnforcement(plan, workflowContext);

      expect(result.agentsToAdd.some((a) => a.role === 'reviewer')).toBe(true);
    });

    it('should combine registry and custom rules', () => {
      roleRegistry.addEnforcementRule({
        trigger: 'code_modification',
        role: 'security',
        when: 'after',
      });

      const customEngine = new EnforcementEngine(roleRegistry, {
        customRules: [
          {
            trigger: 'code_modification',
            role: 'reviewer',
            when: 'after',
          },
        ],
      });

      const rules = customEngine.getAllRules();
      expect(rules).toHaveLength(2);
      expect(rules.some((r) => r.role === 'security')).toBe(true);
      expect(rules.some((r) => r.role === 'reviewer')).toBe(true);
    });
  });

  describe('skip enforcement', () => {
    it('should skip enforcement when configured', () => {
      const skipEngine = new EnforcementEngine(roleRegistry, {
        skipEnforcement: true,
      });

      skipEngine.addRule({
        trigger: 'code_modification',
        role: 'security',
        when: 'after',
      });

      const plan: WorkflowPlan = {
        id: 'plan-1',
        task: 'Modify code',
        description: 'Implement feature',
        tasks: [
          {
            id: 'task-1',
            description: 'Implement',
            suggestedRole: 'thinker',
            complexity: 0.6,
          },
        ],
        executionMode: 'sequential',
        complexity: 0.6,
      };

      const result = skipEngine.checkEnforcement(plan, workflowContext);
      expect(result.triggered).toBe(false);
      expect(result.agentsToAdd).toHaveLength(0);
    });
  });

  describe('rule management', () => {
    it('should add rule via method', () => {
      engine.addRule({
        trigger: 'security_scan',
        role: 'security',
        when: 'always',
      });

      expect(engine.getAllRules()).toHaveLength(1);
    });

    it('should remove custom rule', () => {
      engine.addRule({
        trigger: 'code_modification',
        role: 'security',
        when: 'after',
      });

      engine.removeRule('code_modification', 'security');
      expect(engine.getAllRules()).toHaveLength(0);
    });

    it('should check if enforcement would trigger', () => {
      engine.addRule({
        trigger: 'code_modification',
        role: 'security',
        when: 'after',
      });

      expect(engine.wouldTrigger('code_modification')).toBe(true);
      expect(engine.wouldTrigger('test_execution')).toBe(false);
    });

    it('should get required agents for trigger', () => {
      engine.addRule({
        trigger: 'code_modification',
        role: 'security',
        when: 'after',
      });

      engine.addRule({
        trigger: 'code_modification',
        role: 'reviewer',
        when: 'after',
      });

      const required = engine.getRequiredAgents('code_modification');
      expect(required).toContain('security');
      expect(required).toContain('reviewer');
      expect(required).toHaveLength(2);
    });
  });

  describe('task generation', () => {
    it('should generate appropriate task description for enforced agent', () => {
      engine.addRule({
        trigger: 'code_modification',
        role: 'security',
        when: 'after',
      });

      const plan: WorkflowPlan = {
        id: 'plan-1',
        task: 'Implement auth',
        description: 'Authentication system',
        tasks: [
          {
            id: 'task-1',
            description: 'Implement authentication',
            suggestedRole: 'thinker',
            complexity: 0.7,
          },
        ],
        executionMode: 'sequential',
        complexity: 0.7,
      };

      const enforced = engine.enforce(plan, workflowContext);
      const securityTask = enforced.tasks.find((t) => t.suggestedRole === 'security');

      expect(securityTask?.description).toContain('security audit');
      expect(securityTask?.description).toContain('vulnerabilities');
    });
  });

  describe('conditional enforcement', () => {
    it('should respect custom conditions', () => {
      engine.addRule({
        trigger: 'code_modification',
        role: 'security',
        when: 'after',
        condition: (context: any) => context.sharedState.filesModified.length > 0,
      });

      const plan: WorkflowPlan = {
        id: 'plan-1',
        task: 'Modify code',
        description: 'Implement feature',
        tasks: [
          {
            id: 'task-1',
            description: 'Implement',
            suggestedRole: 'thinker',
            complexity: 0.6,
          },
        ],
        executionMode: 'sequential',
        complexity: 0.6,
      };

      // No files modified
      let result = engine.checkEnforcement(plan, workflowContext);
      expect(result.agentsToAdd).toHaveLength(0);

      // Files modified
      workflowContext.sharedState.filesModified.push('test.ts');
      result = engine.checkEnforcement(plan, workflowContext);
      expect(result.agentsToAdd).toHaveLength(1);
    });
  });
});
