/**
 * LoopDetector tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LoopDetector, type AgentCall } from '../../../../src/core/roles/LoopDetector.js';
import { RoleRegistry } from '../../../../src/core/roles/RoleRegistry.js';
import type { WorkflowContext } from '../../../../src/core/roles/types.js';

describe('LoopDetector', () => {
  let detector: LoopDetector;
  let roleRegistry: RoleRegistry;
  let workflowContext: WorkflowContext;

  beforeEach(() => {
    roleRegistry = new RoleRegistry();

    // Register loop patterns for testing
    roleRegistry.registerLoopPattern('refactor-test-review', {
      pattern: ['refactoring', 'tester', 'reviewer'],
      maxIterations: 5,
      breakCondition: () => false,
    });

    detector = new LoopDetector(roleRegistry, {
      maxTotalAgents: 10,
      maxNestingDepth: 5,
      maxLoopIterations: 3,
      maxNestedLoops: 2,
    });

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

  describe('call stack management', () => {
    it('should push and pop calls', () => {
      const call: AgentCall = {
        agentId: 'agent-1',
        role: 'finder',
        depth: 0,
        timestamp: new Date(),
      };

      detector.pushCall(call);
      expect(detector.getCallStack()).toHaveLength(1);

      detector.popCall();
      expect(detector.getCallStack()).toHaveLength(0);
    });

    it('should track current depth', () => {
      expect(detector.getCurrentDepth()).toBe(0);

      detector.pushCall({ agentId: 'a1', role: 'finder', depth: 0, timestamp: new Date() });
      expect(detector.getCurrentDepth()).toBe(1);

      detector.pushCall({ agentId: 'a2', role: 'thinker', depth: 1, timestamp: new Date() });
      expect(detector.getCurrentDepth()).toBe(2);

      detector.popCall();
      expect(detector.getCurrentDepth()).toBe(1);
    });
  });

  describe('loop detection', () => {
    it('should detect allowed loop pattern', () => {
      // Add calls matching a registered pattern
      detector.pushCall({ agentId: 'a1', role: 'refactoring', depth: 0, timestamp: new Date() });
      detector.pushCall({ agentId: 'a2', role: 'tester', depth: 1, timestamp: new Date() });

      const loopInfo = detector.detectLoop('reviewer', workflowContext);

      expect(loopInfo).toBeDefined();
      expect(loopInfo?.pattern).toEqual(['refactoring', 'tester', 'reviewer']);
      expect(loopInfo?.isAllowed).toBe(true);
      expect(loopInfo?.currentIteration).toBe(1);
    });

    it('should detect accidental infinite loop', () => {
      // Create a cycle: finder → thinker → finder → thinker
      // (repeating sequence that's NOT a registered pattern)
      detector.pushCall({ agentId: 'a1', role: 'finder', depth: 0, timestamp: new Date() });
      detector.pushCall({ agentId: 'a2', role: 'thinker', depth: 1, timestamp: new Date() });
      detector.pushCall({ agentId: 'a3', role: 'finder', depth: 2, timestamp: new Date() });

      const loopInfo = detector.detectLoop('thinker', workflowContext);

      // Should detect cycle [finder, thinker] repeating
      expect(loopInfo).toBeDefined();
      if (loopInfo) {
        expect(loopInfo.isAllowed).toBe(false);
        expect(loopInfo.reason).toContain('loop');
      }
    });

    it('should return null when no loop detected', () => {
      detector.pushCall({ agentId: 'a1', role: 'finder', depth: 0, timestamp: new Date() });

      const loopInfo = detector.detectLoop('thinker', workflowContext);

      // No registered pattern matches [finder, thinker]
      expect(loopInfo).toBeNull();
    });

    it('should increment loop iteration count', () => {
      const pattern = ['refactoring', 'tester', 'reviewer'];

      expect(detector.getLoopCount(pattern)).toBe(0);

      detector.incrementLoop(pattern);
      expect(detector.getLoopCount(pattern)).toBe(1);

      detector.incrementLoop(pattern);
      expect(detector.getLoopCount(pattern)).toBe(2);
    });

    it('should reset loop count', () => {
      const pattern = ['refactoring', 'tester', 'reviewer'];

      detector.incrementLoop(pattern);
      detector.incrementLoop(pattern);
      expect(detector.getLoopCount(pattern)).toBe(2);

      detector.resetLoop(pattern);
      expect(detector.getLoopCount(pattern)).toBe(0);
    });
  });

  describe('loop allowance', () => {
    it('should allow loop within iteration limit', () => {
      const loopInfo = {
        pattern: ['refactoring', 'tester', 'reviewer'],
        currentIteration: 2,
        isAllowed: true,
      };

      expect(detector.isLoopAllowed(loopInfo)).toBe(true);
    });

    it('should not allow loop exceeding max iterations', () => {
      const loopInfo = {
        pattern: ['refactoring', 'tester', 'reviewer'],
        currentIteration: 5,
        isAllowed: true, // Explicitly allowed but exceeds maxLoopIterations
      };

      expect(detector.isLoopAllowed(loopInfo)).toBe(false);
    });

    it('should not allow explicitly disallowed loops', () => {
      const loopInfo = {
        pattern: ['finder', 'finder'],
        currentIteration: 1,
        isAllowed: false,
      };

      expect(detector.isLoopAllowed(loopInfo)).toBe(false);
    });

    it('should not allow loop when max agents reached', () => {
      // Fill up to maxTotalAgents
      for (let i = 0; i < 10; i++) {
        detector.pushCall({
          agentId: `agent-${i}`,
          role: 'finder',
          depth: i,
          timestamp: new Date(),
        });
      }

      const loopInfo = {
        pattern: ['refactoring', 'tester'],
        currentIteration: 1,
        isAllowed: true,
      };

      expect(detector.isLoopAllowed(loopInfo)).toBe(false);
    });

    it('should not allow loop when max depth reached', () => {
      // Fill up to maxNestingDepth
      for (let i = 0; i < 5; i++) {
        detector.pushCall({
          agentId: `agent-${i}`,
          role: 'finder',
          depth: i,
          timestamp: new Date(),
        });
      }

      const loopInfo = {
        pattern: ['refactoring', 'tester'],
        currentIteration: 1,
        isAllowed: true,
      };

      expect(detector.isLoopAllowed(loopInfo)).toBe(false);
    });
  });

  describe('safety limits', () => {
    it('should pass safety checks initially', () => {
      const result = detector.checkSafetyLimits();
      expect(result.safe).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should fail when max agents reached', () => {
      for (let i = 0; i < 10; i++) {
        detector.pushCall({
          agentId: `agent-${i}`,
          role: 'finder',
          depth: 0,
          timestamp: new Date(),
        });
      }

      const result = detector.checkSafetyLimits();
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('Maximum total agents');
    });

    it('should fail when max depth reached', () => {
      for (let i = 0; i < 5; i++) {
        detector.pushCall({
          agentId: `agent-${i}`,
          role: 'finder',
          depth: i,
          timestamp: new Date(),
        });
      }

      const result = detector.checkSafetyLimits();
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('Maximum nesting depth');
    });

    it('should fail when max nested loops reached', () => {
      detector.enterNestedLoop();
      detector.enterNestedLoop();

      const result = detector.checkSafetyLimits();
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('Maximum nested loops');
    });
  });

  describe('nested loop management', () => {
    it('should track nested loop count', () => {
      expect(detector.getStats().nestedLoops).toBe(0);

      detector.enterNestedLoop();
      expect(detector.getStats().nestedLoops).toBe(1);

      detector.enterNestedLoop();
      expect(detector.getStats().nestedLoops).toBe(2);

      detector.exitNestedLoop();
      expect(detector.getStats().nestedLoops).toBe(1);

      detector.exitNestedLoop();
      expect(detector.getStats().nestedLoops).toBe(0);
    });

    it('should not go below zero when exiting loops', () => {
      detector.exitNestedLoop();
      detector.exitNestedLoop();
      expect(detector.getStats().nestedLoops).toBe(0);
    });
  });

  describe('reset', () => {
    it('should reset all state', () => {
      detector.pushCall({ agentId: 'a1', role: 'finder', depth: 0, timestamp: new Date() });
      detector.incrementLoop(['finder', 'thinker']);
      detector.enterNestedLoop();

      detector.reset();

      expect(detector.getCallStack()).toHaveLength(0);
      expect(detector.getLoopCount(['finder', 'thinker'])).toBe(0);
      expect(detector.getStats().nestedLoops).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should provide comprehensive stats', () => {
      detector.pushCall({ agentId: 'a1', role: 'finder', depth: 0, timestamp: new Date() });
      detector.incrementLoop(['finder', 'thinker']);
      detector.enterNestedLoop();

      const stats = detector.getStats();

      expect(stats.totalAgents).toBe(1);
      expect(stats.currentDepth).toBe(1);
      expect(stats.nestedLoops).toBe(1);
      expect(stats.activeLoops).toBe(1);
      expect(stats.loopCounts['finder→thinker']).toBe(1);
    });
  });

  describe('call stack formatting', () => {
    it('should format call stack for debugging', () => {
      detector.pushCall({ agentId: 'a1', role: 'finder', depth: 0, timestamp: new Date() });
      detector.pushCall({ agentId: 'a2', role: 'thinker', depth: 1, timestamp: new Date() });

      const formatted = detector.formatCallStack();

      expect(formatted).toContain('0. finder (a1)');
      expect(formatted).toContain('1. thinker (a2)');
    });

    it('should indent nested calls', () => {
      detector.pushCall({ agentId: 'a1', role: 'finder', depth: 0, timestamp: new Date() });
      detector.pushCall({ agentId: 'a2', role: 'thinker', depth: 1, timestamp: new Date() });
      detector.pushCall({ agentId: 'a3', role: 'reviewer', depth: 2, timestamp: new Date() });

      const formatted = detector.formatCallStack();

      // Depth 1 should have 2 spaces indent
      expect(formatted).toMatch(/\s{2}1\. thinker/);
      // Depth 2 should have 4 spaces indent
      expect(formatted).toMatch(/\s{4}2\. reviewer/);
    });
  });
});
