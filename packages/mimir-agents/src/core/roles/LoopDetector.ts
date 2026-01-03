/**
 * LoopDetector - Detect and manage loops in agent workflows
 */

import type { AgentRole, LoopInfo, WorkflowContext } from './types.js';
import type { RoleRegistry } from './RoleRegistry.js';

/**
 * Options for loop detection
 */
export interface LoopDetectionOptions {
  /**
   * Maximum total agents in workflow
   */
  maxTotalAgents?: number;

  /**
   * Maximum nesting depth
   */
  maxNestingDepth?: number;

  /**
   * Maximum loop iterations
   */
  maxLoopIterations?: number;

  /**
   * Maximum nested loops (loops within loops)
   */
  maxNestedLoops?: number;
}

/**
 * Agent call information for loop detection
 */
export interface AgentCall {
  agentId: string;
  role: AgentRole;
  depth: number;
  parentId?: string;
  timestamp: Date;
}

/**
 * Loop detector for agent workflows
 */
export class LoopDetector {
  private callStack: AgentCall[] = [];
  private loopIterations: Map<string, number> = new Map(); // pattern → count
  private nestedLoopCount = 0;

  constructor(
    private roleRegistry: RoleRegistry,
    private options: LoopDetectionOptions = {}
  ) {
    this.options = {
      maxTotalAgents: 50,
      maxNestingDepth: 10,
      maxLoopIterations: 10,
      maxNestedLoops: 3,
      ...options,
    };
  }

  /**
   * Push an agent call onto the stack
   */
  pushCall(call: AgentCall): void {
    this.callStack.push(call);
  }

  /**
   * Pop an agent call from the stack
   */
  popCall(): AgentCall | undefined {
    return this.callStack.pop();
  }

  /**
   * Get current call stack
   */
  getCallStack(): AgentCall[] {
    return [...this.callStack];
  }

  /**
   * Get current depth
   */
  getCurrentDepth(): number {
    return this.callStack.length;
  }

  /**
   * Detect if adding this agent would create a loop
   */
  detectLoop(role: AgentRole, _context: WorkflowContext): LoopInfo | null {
    // Get recent role sequence
    const recentRoles = this.getRecentRoleSequence();
    recentRoles.push(role);

    // Check if sequence matches any registered loop pattern
    const matchedPattern = this.roleRegistry.matchesLoopPattern(recentRoles);

    if (matchedPattern) {
      const patternKey = recentRoles.join('→');
      const currentIteration = (this.loopIterations.get(patternKey) || 0) + 1;

      return {
        pattern: recentRoles,
        currentIteration,
        isAllowed: currentIteration <= matchedPattern.maxIterations,
        reason:
          currentIteration > matchedPattern.maxIterations
            ? `Loop exceeded maximum iterations (${matchedPattern.maxIterations})`
            : undefined,
      };
    }

    // Check for accidental infinite loops (role calls itself indirectly)
    const cycleDetected = this.detectCycle(role);
    if (cycleDetected) {
      return {
        pattern: cycleDetected.path,
        currentIteration: cycleDetected.count,
        isAllowed: false,
        reason: 'Accidental infinite loop detected (cycle in call graph)',
      };
    }

    return null;
  }

  /**
   * Check if a loop is allowed
   */
  isLoopAllowed(loopInfo: LoopInfo): boolean {
    // Check total agent limit
    if (this.callStack.length >= this.options.maxTotalAgents!) {
      return false;
    }

    // Check nesting depth limit
    if (this.getCurrentDepth() >= this.options.maxNestingDepth!) {
      return false;
    }

    // Check if loop is explicitly allowed
    if (!loopInfo.isAllowed) {
      return false;
    }

    // Check max loop iterations
    if (loopInfo.currentIteration > this.options.maxLoopIterations!) {
      return false;
    }

    return true;
  }

  /**
   * Increment loop iteration count
   */
  incrementLoop(pattern: AgentRole[]): void {
    const patternKey = pattern.join('→');
    const count = this.loopIterations.get(patternKey) || 0;
    this.loopIterations.set(patternKey, count + 1);
  }

  /**
   * Reset loop iteration count for a pattern
   */
  resetLoop(pattern: AgentRole[]): void {
    const patternKey = pattern.join('→');
    this.loopIterations.delete(patternKey);
  }

  /**
   * Get loop iteration count for a pattern
   */
  getLoopCount(pattern: AgentRole[]): number {
    const patternKey = pattern.join('→');
    return this.loopIterations.get(patternKey) || 0;
  }

  /**
   * Detect cycle in call graph (accidental infinite loop)
   */
  private detectCycle(newRole: AgentRole): { path: AgentRole[]; count: number } | null {
    // Build role sequence from call stack
    const roleSequence = this.callStack.map((call) => call.role);
    roleSequence.push(newRole);

    // Find repeating subsequences
    for (let length = 2; length <= Math.floor(roleSequence.length / 2); length++) {
      const lastSequence = roleSequence.slice(-length);
      const prevSequence = roleSequence.slice(-length * 2, -length);

      if (this.sequencesEqual(lastSequence, prevSequence)) {
        // Found repeating cycle
        const count = this.countOccurrences(roleSequence, lastSequence);
        return {
          path: lastSequence,
          count,
        };
      }
    }

    return null;
  }

  /**
   * Get recent role sequence (for pattern matching)
   */
  private getRecentRoleSequence(maxLength: number = 10): AgentRole[] {
    const roles = this.callStack.map((call) => call.role);
    return roles.slice(-maxLength);
  }

  /**
   * Check if two sequences are equal
   */
  private sequencesEqual(seq1: AgentRole[], seq2: AgentRole[]): boolean {
    if (seq1.length !== seq2.length) return false;
    return seq1.every((role, i) => role === seq2[i]);
  }

  /**
   * Count occurrences of subsequence in sequence
   */
  private countOccurrences(sequence: AgentRole[], subsequence: AgentRole[]): number {
    let count = 0;
    let index = 0;

    while (index <= sequence.length - subsequence.length) {
      const slice = sequence.slice(index, index + subsequence.length);
      if (this.sequencesEqual(slice, subsequence)) {
        count++;
        index += subsequence.length;
      } else {
        index++;
      }
    }

    return count;
  }

  /**
   * Check if we've hit safety limits
   */
  checkSafetyLimits(): { safe: boolean; reason?: string } {
    // Check total agents
    if (this.callStack.length >= this.options.maxTotalAgents!) {
      return {
        safe: false,
        reason: `Maximum total agents reached (${this.options.maxTotalAgents})`,
      };
    }

    // Check nesting depth
    if (this.getCurrentDepth() >= this.options.maxNestingDepth!) {
      return {
        safe: false,
        reason: `Maximum nesting depth reached (${this.options.maxNestingDepth})`,
      };
    }

    // Check nested loops
    if (this.nestedLoopCount >= this.options.maxNestedLoops!) {
      return {
        safe: false,
        reason: `Maximum nested loops reached (${this.options.maxNestedLoops})`,
      };
    }

    return { safe: true };
  }

  /**
   * Increment nested loop counter
   */
  enterNestedLoop(): void {
    this.nestedLoopCount++;
  }

  /**
   * Decrement nested loop counter
   */
  exitNestedLoop(): void {
    this.nestedLoopCount = Math.max(0, this.nestedLoopCount - 1);
  }

  /**
   * Reset detector state
   */
  reset(): void {
    this.callStack = [];
    this.loopIterations.clear();
    this.nestedLoopCount = 0;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalAgents: number;
    currentDepth: number;
    nestedLoops: number;
    activeLoops: number;
    loopCounts: Record<string, number>;
  } {
    const loopCounts: Record<string, number> = {};
    for (const [pattern, count] of this.loopIterations.entries()) {
      loopCounts[pattern] = count;
    }

    return {
      totalAgents: this.callStack.length,
      currentDepth: this.getCurrentDepth(),
      nestedLoops: this.nestedLoopCount,
      activeLoops: this.loopIterations.size,
      loopCounts,
    };
  }

  /**
   * Format call stack for debugging
   */
  formatCallStack(): string {
    return this.callStack
      .map((call, index) => {
        const indent = '  '.repeat(call.depth);
        return `${indent}${index}. ${call.role} (${call.agentId})`;
      })
      .join('\n');
  }
}
