/**
 * Task Complexity Analyzer
 *
 * Determines if a task requires multi-agent orchestration based on:
 * 1. Fast heuristic check (patterns, keywords)
 * 2. LLM-based analysis (slower, more accurate)
 */

import type { ILLMProvider } from '@codedir/mimir-agents';
import type { AgentRole } from '@codedir/mimir-agents/core';
import { logger } from '@/shared/utils/logger.js';

export interface ComplexityAnalysis {
  /** Whether task requires multi-agent orchestration */
  isComplex: boolean;

  /** Reasoning for the decision */
  reasoning: string;

  /** Suggested agent roles for the task */
  suggestedAgents: AgentRole[];

  /** Execution mode (sequential, parallel, dag) */
  executionMode: 'sequential' | 'parallel' | 'dag';

  /** Estimated complexity score (0-1) */
  complexityScore: number;
}

export class TaskComplexityAnalyzer {
  constructor(private llmProvider?: ILLMProvider) {}

  /**
   * Quick heuristic check (fast, no LLM call)
   *
   * Checks for complexity indicators:
   * - Multiple aspects (test + security + docs)
   * - Code modification keywords
   * - Multi-step processes
   */
  isLikelyComplex(task: string): boolean {
    const taskLower = task.toLowerCase();

    // Complexity indicators
    const complexityIndicators = [
      // Multi-aspect tasks
      /implement.*feature/i,
      /add.*with.*(test|security|review|docs)/i,
      /refactor.*and.*(test|review)/i,
      /build.*with.*(security|tests)/i,
      /create.*with.*(documentation|tests)/i,
      /fix.*and.*(test|review)/i,

      // Security/audit requirements
      /(security|audit|review).*required/i,
      /security.*analysis/i,

      // Multi-file/complex changes
      /multiple.*files/i,
      /end.to.end/i,
      /full.*implementation/i,
      /complete.*overhaul/i,
    ];

    // Count distinct aspects mentioned
    const aspects = [/test/i, /document/i, /security/i, /review/i, /refactor/i, /implement/i];

    const aspectCount = aspects.filter((pattern) => pattern.test(taskLower)).length;

    // Complex if:
    // 1. Matches a complexity indicator, OR
    // 2. Mentions 2+ distinct aspects
    const matchesIndicator = complexityIndicators.some((pattern) => pattern.test(task));
    const hasMultipleAspects = aspectCount >= 2;

    const isComplex = matchesIndicator || hasMultipleAspects;

    logger.debug('Heuristic complexity check', {
      task: task.substring(0, 100),
      matchesIndicator,
      aspectCount,
      isComplex,
    });

    return isComplex;
  }

  /**
   * LLM-based complexity analysis (slower, more accurate)
   *
   * Uses LLM to:
   * 1. Determine if task is complex
   * 2. Suggest agent roles
   * 3. Recommend execution mode
   */
  async analyze(task: string): Promise<ComplexityAnalysis> {
    if (!this.llmProvider) {
      // Fallback to heuristic if no LLM provider
      const isComplex = this.isLikelyComplex(task);
      return {
        isComplex,
        reasoning: isComplex
          ? 'Task appears complex based on heuristic analysis'
          : 'Task appears simple based on heuristic analysis',
        suggestedAgents: isComplex ? ['general' as AgentRole] : [],
        executionMode: 'sequential',
        complexityScore: isComplex ? 0.7 : 0.3,
      };
    }

    try {
      const prompt = this.buildAnalysisPrompt(task);
      const response = await this.llmProvider.chat([{ role: 'user', content: prompt }]);

      const analysis = this.parseAnalysisResponse(response.content);
      return analysis;
    } catch (error) {
      logger.warn('LLM analysis failed, falling back to heuristic', { error });

      const isComplex = this.isLikelyComplex(task);
      return {
        isComplex,
        reasoning: `Heuristic analysis (LLM unavailable): ${isComplex ? 'Complex' : 'Simple'} task`,
        suggestedAgents: isComplex ? ['general' as AgentRole] : [],
        executionMode: 'sequential',
        complexityScore: isComplex ? 0.7 : 0.3,
      };
    }
  }

  /**
   * Build analysis prompt for LLM
   */
  private buildAnalysisPrompt(task: string): string {
    return `Analyze this task and determine if it requires multiple specialized agents:

Task: "${task}"

Consider:
1. Does it require multiple distinct skills? (e.g., file search + implementation + testing + review)
2. Does it modify code? (if yes, likely needs tests + security review)
3. Is it a multi-step process?
4. Would it benefit from parallel execution?
5. Does it involve multiple files or modules?

Available agent roles:
- finder: Quick file searches (read-only, fast)
- thinker: Deep reasoning, complex implementations (all tools, slow)
- librarian: API/docs research (read-only + web)
- refactoring: Code refactoring (read + write, no bash)
- reviewer: Code review (read + git)
- tester: Test generation and execution (read + write + bash)
- security: Security analysis (read + git)
- rush: Quick targeted tasks (3-5 iterations)
- general: General purpose agent

Respond with JSON only (no markdown):
{
  "isComplex": boolean,
  "reasoning": string,
  "suggestedAgents": ["role1", "role2", ...],
  "executionMode": "sequential" | "parallel" | "dag",
  "complexityScore": number (0-1)
}

Examples:

Task: "Add OAuth2 authentication with tests and security review"
{
  "isComplex": true,
  "reasoning": "Requires implementation, testing, and security analysis - distinct skills",
  "suggestedAgents": ["finder", "thinker", "tester", "security", "reviewer"],
  "executionMode": "dag",
  "complexityScore": 0.9
}

Task: "What files are in the src directory?"
{
  "isComplex": false,
  "reasoning": "Simple file search, single agent sufficient",
  "suggestedAgents": ["finder"],
  "executionMode": "sequential",
  "complexityScore": 0.1
}

Task: "Refactor authentication module"
{
  "isComplex": true,
  "reasoning": "Code modification requires testing and review",
  "suggestedAgents": ["refactoring", "tester", "reviewer"],
  "executionMode": "sequential",
  "complexityScore": 0.7
}

Now analyze the given task and respond with JSON:`;
  }

  /**
   * Parse LLM response into ComplexityAnalysis
   */
  private parseAnalysisResponse(content: string): ComplexityAnalysis {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const codeBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/;
      // eslint-disable-next-line sonarjs/slow-regex
      const jsonRegex = /(\{[\s\S]*\})/;
      const jsonMatch = codeBlockRegex.exec(content) || jsonRegex.exec(content);

      if (!jsonMatch || !jsonMatch[1]) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[1]) as {
        isComplex?: boolean;
        reasoning?: string;
        suggestedAgents?: string[];
        executionMode?: string;
        complexityScore?: number;
      };

      // Validate and normalize
      return {
        isComplex: Boolean(parsed.isComplex),
        reasoning: parsed.reasoning ? String(parsed.reasoning) : 'No reasoning provided',
        suggestedAgents: (Array.isArray(parsed.suggestedAgents)
          ? parsed.suggestedAgents
          : []) as AgentRole[],
        executionMode: (parsed.executionMode &&
        ['sequential', 'parallel', 'dag'].includes(parsed.executionMode)
          ? parsed.executionMode
          : 'sequential') as 'sequential' | 'parallel' | 'dag',
        complexityScore:
          typeof parsed.complexityScore === 'number'
            ? Math.max(0, Math.min(1, parsed.complexityScore))
            : 0.5,
      };
    } catch (error) {
      logger.error('Failed to parse LLM analysis response', { error, content });

      // Fallback to heuristic
      return {
        isComplex: false,
        reasoning: 'Failed to parse LLM response',
        suggestedAgents: [],
        executionMode: 'sequential',
        complexityScore: 0.3,
      };
    }
  }
}
