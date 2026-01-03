/**
 * AgentFactory - Create specialized agents based on roles
 */

import { Agent } from './Agent.js';
import type { IAgent } from './interfaces/IAgent.js';
import type { AgentConfig } from './types.js';
import type { ToolRegistry } from '../tools/ToolRegistry.js';
import type { RoleRegistry } from './roles/RoleRegistry.js';
import type { AgentRole, RoleConfig, ToolAccessLevel } from './roles/types.js';
import type { IExecutor } from '../execution/IExecutor.js';

/**
 * LLM Provider interface (simplified - will be replaced with actual provider)
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
 * Agent factory options
 */
export interface AgentFactoryOptions {
  /**
   * Default LLM provider (if not specified in role)
   */
  defaultProvider?: ILLMProvider;

  /**
   * Override model selection
   */
  modelOverride?: string;

  /**
   * Override tool restrictions
   */
  allowToolOverride?: boolean;
}

/**
 * Factory for creating specialized agents
 */
export class AgentFactory {
  constructor(
    private roleRegistry: RoleRegistry,
    private toolRegistry: ToolRegistry,
    private llmProvider: ILLMProvider,
    private executor: IExecutor,
    private options: AgentFactoryOptions = {}
  ) {}

  /**
   * Create an agent based on role
   */
  createAgent(role: AgentRole, overrides?: Partial<AgentConfig>): IAgent {
    // Get role configuration
    const roleConfig = this.roleRegistry.getOrThrow(role);

    // Build agent config from role
    const config = this.buildConfig(roleConfig, overrides);

    // Create agent
    const agent = new Agent(config, this.llmProvider, this.toolRegistry, this.executor);

    // Apply tool restrictions
    this.applyToolRestrictions(agent, roleConfig);

    return agent;
  }

  /**
   * Create an agent from explicit config (without role)
   */
  createFromConfig(config: AgentConfig): IAgent {
    return new Agent(config, this.llmProvider, this.toolRegistry, this.executor);
  }

  /**
   * Build agent config from role config
   */
  private buildConfig(roleConfig: RoleConfig, overrides?: Partial<AgentConfig>): AgentConfig {
    // Determine model to use
    const model =
      overrides?.model ||
      this.options.modelOverride ||
      roleConfig.recommendedModel ||
      'claude-sonnet-4.5';

    // Determine tools to allow
    const tools = this.determineTools(roleConfig, overrides);

    // Build final config
    const config: AgentConfig = {
      name: overrides?.name || `${roleConfig.role}-agent`,
      role: roleConfig.role,
      model,
      temperature: overrides?.temperature ?? 0.7,
      systemPrompt: overrides?.systemPrompt || roleConfig.systemPromptTemplate,
      budget: {
        ...roleConfig.defaultBudget,
        ...overrides?.budget,
      },
      tools,
    };

    return config;
  }

  /**
   * Determine which tools the agent should have access to
   */
  private determineTools(roleConfig: RoleConfig, overrides?: Partial<AgentConfig>): string[] {
    // If override tools specified and allowed, use them
    if (overrides?.tools && this.options.allowToolOverride) {
      return overrides.tools;
    }

    // If role has explicit allowedTools, use those
    if (roleConfig.allowedTools) {
      return this.filterTools(roleConfig.allowedTools, roleConfig.forbiddenTools);
    }

    // Otherwise, determine from toolAccessLevel
    if (roleConfig.toolAccessLevel) {
      return this.getToolsForAccessLevel(roleConfig.toolAccessLevel, roleConfig.forbiddenTools);
    }

    // Default: all tools
    return this.toolRegistry.list().map((t) => t.definition.name);
  }

  /**
   * Filter tools based on allowed/forbidden lists
   */
  private filterTools(allowed: string[], forbidden?: string[]): string[] {
    const allTools = this.toolRegistry.list().map((t) => t.definition.name);

    // Start with allowed tools (expand patterns)
    let tools = this.expandToolPatterns(allowed, allTools);

    // Remove forbidden tools (expand patterns)
    if (forbidden) {
      const forbiddenExpanded = this.expandToolPatterns(forbidden, allTools);
      tools = tools.filter((t) => !forbiddenExpanded.includes(t));
    }

    return tools;
  }

  /**
   * Expand tool patterns (e.g., "file_*" → ["file_read", "file_write", ...])
   */
  private expandToolPatterns(patterns: string[], allTools: string[]): string[] {
    const expanded: Set<string> = new Set();

    for (const pattern of patterns) {
      if (pattern.includes('*')) {
        // Wildcard pattern
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
        for (const tool of allTools) {
          if (regex.test(tool)) {
            expanded.add(tool);
          }
        }
      } else {
        // Exact match
        if (allTools.includes(pattern)) {
          expanded.add(pattern);
        }
      }
    }

    return Array.from(expanded);
  }

  /**
   * Get tools for access level
   */
  private getToolsForAccessLevel(level: ToolAccessLevel, forbidden?: string[]): string[] {
    const allTools = this.toolRegistry.list().map((t) => t.definition.name);

    let allowed: string[];

    switch (level) {
      case 'read-only':
        allowed = ['read_file', 'glob', 'grep', 'diff'];
        break;

      case 'read-write':
        allowed = ['read_file', 'write_file', 'glob', 'grep', 'diff'];
        break;

      case 'read-git':
        allowed = ['read_file', 'glob', 'grep', 'diff', 'git'];
        break;

      case 'read-write-bash':
        allowed = ['read_file', 'write_file', 'glob', 'grep', 'diff', 'bash'];
        break;

      case 'all':
        allowed = allTools;
        break;

      default:
        allowed = allTools;
    }

    // Filter by what's actually available
    allowed = allowed.filter((t) => allTools.includes(t));

    // Remove forbidden
    if (forbidden) {
      const forbiddenExpanded = this.expandToolPatterns(forbidden, allTools);
      allowed = allowed.filter((t) => !forbiddenExpanded.includes(t));
    }

    return allowed;
  }

  /**
   * Apply tool restrictions to agent (filters tool registry)
   */
  private applyToolRestrictions(_agent: IAgent, _roleConfig: RoleConfig): void {
    // Note: This is a simplified version.
    // In the actual implementation, we'd need to pass a filtered tool registry
    // to the agent, or the agent would need to check tool permissions.
    // For now, we're just documenting the intended behavior.
    // The agent's tools config already has the filtered tool list,
    // so the agent will only use those tools when making decisions.
  }

  /**
   * Get available roles
   */
  getAvailableRoles(): AgentRole[] {
    return this.roleRegistry.getRoles();
  }

  /**
   * Get role configuration
   */
  getRoleConfig(role: AgentRole): RoleConfig | undefined {
    return this.roleRegistry.get(role);
  }

  /**
   * Check if role exists
   */
  hasRole(role: AgentRole): boolean {
    return this.roleRegistry.has(role);
  }
}
