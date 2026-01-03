/**
 * RoleRegistry - Registry of agent roles and their configurations
 */

import type {
  AgentRole,
  RoleConfig,
  ToolAccessLevel,
  EnforcementRule,
  EnforcementTrigger,
  LoopPattern,
} from './types.js';

/**
 * Registry for agent role configurations
 */
export class RoleRegistry {
  private roles: Map<AgentRole, RoleConfig> = new Map();
  private enforcementRules: EnforcementRule[] = [];
  private loopPatterns: Map<string, LoopPattern> = new Map();

  constructor() {
    this.registerStandardRoles();
  }

  /**
   * Register standard agent roles
   */
  private registerStandardRoles(): void {
    // Finder - Quick file searches, read-only
    this.register({
      role: 'finder',
      description: 'Quick file searches and code navigation. Uses fast models and read-only tools.',
      recommendedModel: 'claude-haiku-4.5',
      alternativeModels: ['qwen-2.5-coder', 'deepseek-chat'],
      toolAccessLevel: 'read-only',
      allowedTools: ['read_file', 'glob', 'grep', 'diff'],
      defaultBudget: {
        maxIterations: 5,
        maxTokens: 10_000,
        maxCost: 0.05,
        maxDuration: 30_000, // 30 seconds
      },
      systemPromptTemplate: `You are a Finder agent specialized in quickly locating files and code patterns.

Your role:
- Search for files using glob patterns
- Search code using grep/regex
- Navigate codebases efficiently
- Provide precise file locations and code snippets

Constraints:
- Read-only access (cannot modify files)
- Maximum 5 iterations
- Focus on speed and accuracy`,
    });

    // Thinker - Deep reasoning, complex problems
    this.register({
      role: 'thinker',
      description:
        'Deep reasoning and complex problem solving. Uses advanced models with full tool access.',
      recommendedModel: 'claude-opus-4.5',
      alternativeModels: ['o3', 'claude-sonnet-4.5', 'gpt-4.5'],
      toolAccessLevel: 'all',
      defaultBudget: {
        maxIterations: 20,
        maxTokens: 200_000,
        maxCost: 5.0,
        maxDuration: 600_000, // 10 minutes
      },
      systemPromptTemplate: `You are a Thinker agent specialized in deep reasoning and complex problem solving.

Your role:
- Analyze complex codebases and architectures
- Design solutions to difficult problems
- Implement features requiring deep understanding
- Make architectural decisions

Capabilities:
- Full tool access (read, write, bash, git)
- Extended iteration budget
- High token budget for complex reasoning

Approach:
- Break down complex problems systematically
- Consider edge cases and trade-offs
- Write high-quality, well-tested code
- Document your reasoning`,
    });

    // Librarian - API/docs research
    this.register({
      role: 'librarian',
      description:
        'API and documentation research. Specialized in finding and understanding external references.',
      recommendedModel: 'claude-sonnet-4.5',
      alternativeModels: ['gpt-4.5', 'claude-opus-4.5'],
      toolAccessLevel: 'read-only',
      allowedTools: ['read_file', 'glob', 'grep', 'web_search', 'web_fetch'],
      defaultBudget: {
        maxIterations: 10,
        maxTokens: 50_000,
        maxCost: 0.5,
        maxDuration: 120_000, // 2 minutes
      },
      systemPromptTemplate: `You are a Librarian agent specialized in researching APIs and documentation.

Your role:
- Search and analyze API documentation
- Find code examples and usage patterns
- Research best practices
- Understand external libraries and frameworks

Capabilities:
- Read-only file access
- Web search and fetch
- Documentation analysis

Approach:
- Find authoritative sources
- Extract relevant information
- Provide clear examples
- Cite sources accurately`,
    });

    // Refactoring - Code refactoring
    this.register({
      role: 'refactoring',
      description:
        'Code refactoring and improvement. Maintains functionality while improving code quality.',
      recommendedModel: 'claude-sonnet-4.5',
      alternativeModels: ['gpt-4.5', 'claude-opus-4.5'],
      toolAccessLevel: 'read-write',
      allowedTools: ['read_file', 'write_file', 'glob', 'grep', 'diff', 'git'],
      forbiddenTools: ['bash'], // No arbitrary command execution
      defaultBudget: {
        maxIterations: 15,
        maxTokens: 100_000,
        maxCost: 1.0,
        maxDuration: 300_000, // 5 minutes
      },
      systemPromptTemplate: `You are a Refactoring agent specialized in improving code quality.

Your role:
- Refactor code for better readability and maintainability
- Apply design patterns appropriately
- Improve code structure without changing behavior
- Ensure backward compatibility

Capabilities:
- Read and write files
- Git operations (for tracking changes)
- Code analysis tools

Constraints:
- Maintain existing functionality
- Preserve API contracts
- No arbitrary bash execution

Approach:
- Analyze code thoroughly before refactoring
- Make incremental, reviewable changes
- Test after each significant change
- Document refactoring decisions`,
    });

    // Reviewer - Code review and quality checks
    this.register({
      role: 'reviewer',
      description:
        'Code review and quality assessment. Provides detailed feedback on code quality.',
      recommendedModel: 'claude-sonnet-4.5',
      alternativeModels: ['o3', 'claude-opus-4.5'],
      toolAccessLevel: 'read-git',
      allowedTools: ['read_file', 'glob', 'grep', 'diff', 'git'],
      defaultBudget: {
        maxIterations: 10,
        maxTokens: 80_000,
        maxCost: 0.8,
        maxDuration: 180_000, // 3 minutes
      },
      systemPromptTemplate: `You are a Reviewer agent specialized in code review and quality assessment.

Your role:
- Review code for quality, readability, and maintainability
- Identify potential bugs and edge cases
- Check for code style and best practices
- Provide constructive feedback

Capabilities:
- Read files and diffs
- Git operations (view changes, history)
- Code analysis tools

Review criteria:
- Correctness and functionality
- Code quality and readability
- Performance implications
- Security considerations
- Test coverage
- Documentation

Approach:
- Thorough but constructive
- Specific, actionable feedback
- Highlight both issues and good practices
- Suggest improvements, don't just criticize`,
    });

    // Tester - Test generation and execution
    this.register({
      role: 'tester',
      description: 'Test generation and execution. Creates comprehensive tests and validates code.',
      recommendedModel: 'claude-sonnet-4.5',
      alternativeModels: ['gpt-4.5', 'deepseek-coder'],
      toolAccessLevel: 'read-write-bash',
      allowedTools: ['read_file', 'write_file', 'glob', 'grep', 'bash', 'diff'],
      defaultBudget: {
        maxIterations: 15,
        maxTokens: 100_000,
        maxCost: 1.0,
        maxDuration: 300_000, // 5 minutes
      },
      systemPromptTemplate: `You are a Tester agent specialized in test generation and execution.

Your role:
- Generate comprehensive test suites
- Execute tests and analyze results
- Identify missing test coverage
- Debug failing tests

Capabilities:
- Read and write test files
- Execute test commands (bash)
- Analyze test output

Testing approach:
- Unit tests for individual functions
- Integration tests for component interaction
- Edge cases and error handling
- Mocking and fixtures where appropriate

Quality criteria:
- High code coverage
- Clear, maintainable tests
- Fast execution
- Isolated, independent tests`,
    });

    // Security - Security analysis
    this.register({
      role: 'security',
      description:
        'Security analysis and vulnerability detection. Identifies security issues in code.',
      recommendedModel: 'claude-sonnet-4.5',
      alternativeModels: ['o3', 'claude-opus-4.5'],
      toolAccessLevel: 'read-git',
      allowedTools: ['read_file', 'glob', 'grep', 'diff', 'git'],
      defaultBudget: {
        maxIterations: 10,
        maxTokens: 80_000,
        maxCost: 0.8,
        maxDuration: 180_000, // 3 minutes
      },
      systemPromptTemplate: `You are a Security agent specialized in identifying security vulnerabilities.

Your role:
- Identify security vulnerabilities (OWASP Top 10, CWE)
- Check for insecure coding practices
- Validate input sanitization and output encoding
- Review authentication and authorization logic
- Detect secrets and sensitive data exposure

Capabilities:
- Read files and analyze code
- View git history for security-relevant changes
- Pattern matching for common vulnerabilities

Security checks:
- SQL injection, XSS, CSRF
- Command injection, path traversal
- Authentication bypasses
- Insecure cryptography
- Dependency vulnerabilities
- Secrets in code/config

Approach:
- Systematic security analysis
- Risk-based prioritization (critical → low)
- Specific, actionable recommendations
- Context-aware (consider threat model)`,
    });

    // Rush - Quick targeted loops
    this.register({
      role: 'rush',
      description:
        'Quick, focused task execution with minimal iterations. For simple, well-defined tasks.',
      recommendedModel: 'claude-haiku-4.5',
      alternativeModels: ['qwen-2.5-coder', 'deepseek-chat'],
      toolAccessLevel: 'all',
      defaultBudget: {
        maxIterations: 3,
        maxTokens: 5_000,
        maxCost: 0.02,
        maxDuration: 15_000, // 15 seconds
      },
      systemPromptTemplate: `You are a Rush agent specialized in quick, focused task execution.

Your role:
- Execute simple, well-defined tasks quickly
- Make targeted changes with minimal exploration
- Optimize for speed over thoroughness

Capabilities:
- Full tool access
- Very limited iterations (3 max)

Constraints:
- Don't overthink - act quickly
- Don't explore broadly - stay focused
- If task is complex, delegate to thinker

Ideal for:
- Simple bug fixes
- Quick file edits
- Straightforward implementations
- Well-scoped tasks`,
    });

    // General - General purpose
    this.register({
      role: 'general',
      description:
        'General purpose agent with balanced capabilities. Default role for unspecified tasks.',
      recommendedModel: 'claude-sonnet-4.5',
      alternativeModels: ['gpt-4.5', 'deepseek-chat'],
      toolAccessLevel: 'all',
      defaultBudget: {
        maxIterations: 20,
        maxTokens: 150_000,
        maxCost: 2.0,
        maxDuration: 600_000, // 10 minutes
      },
      systemPromptTemplate: `You are a General agent with balanced capabilities.

Your role:
- Handle a wide variety of tasks
- Adapt your approach based on task requirements
- Leverage appropriate tools and reasoning

Capabilities:
- Full tool access
- Moderate iteration and token budget

Approach:
- Assess task complexity before starting
- Use appropriate level of detail
- Balance speed and quality
- Delegate to specialized agents when beneficial`,
    });
  }

  /**
   * Register a role configuration
   */
  register(config: RoleConfig): void {
    this.roles.set(config.role, config);
  }

  /**
   * Get role configuration
   */
  get(role: AgentRole): RoleConfig | undefined {
    return this.roles.get(role);
  }

  /**
   * Get role configuration (throws if not found)
   */
  getOrThrow(role: AgentRole): RoleConfig {
    const config = this.roles.get(role);
    if (!config) {
      throw new Error(`Role not found: ${role}`);
    }
    return config;
  }

  /**
   * List all registered roles
   */
  list(): RoleConfig[] {
    return Array.from(this.roles.values());
  }

  /**
   * Check if role exists
   */
  has(role: AgentRole): boolean {
    return this.roles.has(role);
  }

  /**
   * Get all role names
   */
  getRoles(): AgentRole[] {
    return Array.from(this.roles.keys());
  }

  /**
   * Add enforcement rule
   */
  addEnforcementRule(rule: EnforcementRule): void {
    this.enforcementRules.push(rule);
  }

  /**
   * Get enforcement rules for a trigger
   */
  getEnforcementRules(trigger: EnforcementTrigger): EnforcementRule[] {
    return this.enforcementRules.filter(
      (rule) => rule.trigger === trigger || rule.trigger === 'always'
    );
  }

  /**
   * Get all enforcement rules
   */
  getAllEnforcementRules(): EnforcementRule[] {
    return [...this.enforcementRules];
  }

  /**
   * Check if a role is enforced for a trigger
   */
  isEnforced(role: AgentRole, trigger: EnforcementTrigger): boolean {
    return this.enforcementRules.some(
      (rule) => rule.role === role && (rule.trigger === trigger || rule.trigger === 'always')
    );
  }

  /**
   * Register a loop pattern
   */
  registerLoopPattern(name: string, pattern: LoopPattern): void {
    this.loopPatterns.set(name, pattern);
  }

  /**
   * Get loop pattern by name
   */
  getLoopPattern(name: string): LoopPattern | undefined {
    return this.loopPatterns.get(name);
  }

  /**
   * Get all loop patterns
   */
  getAllLoopPatterns(): LoopPattern[] {
    return Array.from(this.loopPatterns.values());
  }

  /**
   * Check if a role sequence matches a registered loop pattern
   */
  matchesLoopPattern(sequence: AgentRole[]): LoopPattern | null {
    for (const pattern of this.loopPatterns.values()) {
      if (this.sequenceMatches(sequence, pattern.pattern)) {
        return pattern;
      }
    }
    return null;
  }

  /**
   * Helper: Check if sequence matches pattern
   */
  private sequenceMatches(sequence: AgentRole[], pattern: AgentRole[]): boolean {
    if (sequence.length !== pattern.length) return false;
    return sequence.every((role, index) => role === pattern[index]);
  }

  /**
   * Get tool access level description
   */
  static getToolAccessDescription(level: ToolAccessLevel): string {
    const descriptions: Record<ToolAccessLevel, string> = {
      'read-only': 'Read files, search code (no modifications)',
      'read-write': 'Read and write files, search code (no bash)',
      'read-git': 'Read files, search code, git operations (no modifications except git)',
      'read-write-bash': 'Read, write files, execute bash commands',
      all: 'Full access to all tools',
    };
    return descriptions[level];
  }

  /**
   * Export configuration (for testing/debugging)
   */
  export(): {
    roles: RoleConfig[];
    enforcementRules: EnforcementRule[];
    loopPatterns: Array<{ name: string; pattern: LoopPattern }>;
  } {
    return {
      roles: this.list(),
      enforcementRules: this.getAllEnforcementRules(),
      loopPatterns: Array.from(this.loopPatterns.entries()).map(([name, pattern]) => ({
        name,
        pattern,
      })),
    };
  }
}

/**
 * Default role registry instance
 */
export const defaultRoleRegistry = new RoleRegistry();

// Register some common loop patterns
defaultRoleRegistry.registerLoopPattern('refactor-test-review', {
  pattern: ['refactoring', 'tester', 'reviewer'],
  maxIterations: 5,
  breakCondition: (results) => {
    return results.tester?.success === true && results.reviewer?.approved === true;
  },
  description: 'Iterative refactoring with testing and review',
});

defaultRoleRegistry.registerLoopPattern('implement-test-fix', {
  pattern: ['thinker', 'tester', 'thinker'],
  maxIterations: 5,
  breakCondition: (results) => {
    return results.tester?.success === true;
  },
  description: 'Implement, test, fix cycle',
});

defaultRoleRegistry.registerLoopPattern('security-review-fix', {
  pattern: ['security', 'reviewer', 'thinker'],
  maxIterations: 3,
  breakCondition: (results) => {
    return results.security?.issues?.length === 0 && results.reviewer?.approved === true;
  },
  description: 'Security audit, review, fix cycle',
});
