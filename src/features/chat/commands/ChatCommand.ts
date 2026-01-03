/**
 * Chat command handler
 * Main interactive chat session
 */

import React from 'react';
import { render } from 'ink';
import { ChatApp } from '../components/ChatApp.js';
import { ConfigLoader } from '@/shared/config/ConfigLoader.js';
import { Config, Theme as ThemeType } from '@/shared/config/schemas.js';
import { FirstRunDetector } from '@/features/init/components/firstRunDetector.js';
import { SetupCommand } from '@/features/init/commands/SetupCommand.js';
import type { IFileSystem, MessageContent } from '@codedir/mimir-agents';
import type { PermissionManagerConfig } from '@codedir/mimir-agents/core';
import { Message } from '@/types/index.js';
import { logger } from '@/shared/utils/logger.js';
import { SlashCommandRegistry } from '@/features/chat/slash-commands/SlashCommand.js';
import { CustomCommandLoader } from '@/features/custom-commands/loader/CustomCommandLoader.js';
import { SlashCommandParser } from '@/features/custom-commands/parser/SlashCommandParser.js';
import { installSignalHandlers } from '@/shared/utils/signalHandler.js';
import {
  NewCommand,
  ModelCommand,
  ModeCommand,
  HelpCommand,
  ThemeCommand,
} from '@/features/chat/slash-commands/index.js';
import { MimirInitializer } from '@/features/init/MimirInitializer.js';
import { ProviderFactory } from '@codedir/mimir-agents-node/providers';
import type { ILLMProvider } from '@codedir/mimir-agents';
import { ConfigurationError } from '@/shared/utils/errors.js';
import { TaskComplexityAnalyzer } from '@/features/chat/agent/TaskComplexityAnalyzer.js';
import {
  TaskDecomposer,
  WorkflowOrchestrator,
  SubAgentState,
} from '@codedir/mimir-agents/orchestration';
import { WorkflowPlan, type AgentRole, type AgentStatus } from '@codedir/mimir-agents/core';
import { ToolRegistry } from '@codedir/mimir-agents/tools';
import { NativeExecutor } from '@codedir/mimir-agents-node/execution';
import { AgentSelectionUI } from '@/features/chat/components/AgentSelectionUI.js';
import { MultiAgentProgressView } from '@/features/chat/components/MultiAgentProgressView.js';
import { AgentProgressData } from '@/features/chat/components/AgentProgressRow.js';
import path from 'path';
import yaml from 'yaml';

/**
 * Chat mode type for the current session mode
 */
type ChatMode = 'plan' | 'act' | 'discuss';

/**
 * UI mode for workflow handling
 */
type UIMode = 'chat' | 'workflow-approval' | 'workflow-execution';

/**
 * Workflow status type
 */
type WorkflowStatus = 'running' | 'completed' | 'failed' | 'interrupted';

/**
 * Chat state interface for managing session state
 */
interface ChatState {
  messages: Message[];
  currentMode: ChatMode;
  totalCost: number;
  provider: ILLMProvider | undefined;
  config: Config;
  uiMode: UIMode;
  pendingWorkflowPlan: WorkflowPlan | undefined;
  currentUserInput: string | undefined;
  workflowOrchestrator: WorkflowOrchestrator | undefined;
  workflowStatus: WorkflowStatus;
  workflowStartTime: number;
  agentProgressData: AgentProgressData[];
}

/**
 * Valid LLM providers
 */
const VALID_PROVIDERS = [
  'deepseek',
  'anthropic',
  'openai',
  'google',
  'gemini',
  'qwen',
  'ollama',
] as const;

type ValidProvider = (typeof VALID_PROVIDERS)[number];

/**
 * Convert MessageContent to string
 * Handles both string content and multi-part content (text + images)
 */
function messageContentToString(content: MessageContent): string {
  if (typeof content === 'string') {
    return content;
  }
  // Extract text from multi-part content
  return content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

/**
 * Get default model for a provider
 */
function getDefaultModel(provider: string): string {
  switch (provider.toLowerCase()) {
    case 'deepseek':
      return 'deepseek-chat';
    case 'anthropic':
      return 'claude-sonnet-4-5-20250929';
    case 'openai':
      return 'gpt-4';
    case 'google':
    case 'gemini':
      return 'gemini-pro';
    default:
      return provider;
  }
}

/**
 * Map SubAgentState status to AgentStatus for UI
 * SubAgentState uses: 'pending' | 'running' | 'completed' | 'failed'
 * AgentStatus uses: 'idle' | 'reasoning' | 'acting' | 'observing' | 'completed' | 'failed' | 'interrupted'
 */
function mapSubAgentStatus(status: SubAgentState['status']): AgentStatus {
  switch (status) {
    case 'pending':
      return 'idle';
    case 'running':
      return 'acting';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    default:
      return 'idle';
  }
}

/**
 * Safely cast role string to AgentRole, defaulting to 'general' if unknown
 */
function toAgentRole(role: string): AgentRole {
  const validRoles: AgentRole[] = [
    'finder',
    'thinker',
    'librarian',
    'refactoring',
    'reviewer',
    'tester',
    'rush',
    'security',
    'general',
  ];
  return validRoles.includes(role as AgentRole) ? (role as AgentRole) : 'general';
}

export class ChatCommand {
  private commandRegistry: SlashCommandRegistry;

  constructor(
    private configLoader: ConfigLoader,
    private firstRunDetector: FirstRunDetector,
    private setupCommand: SetupCommand,
    private fs: IFileSystem
  ) {
    this.commandRegistry = new SlashCommandRegistry();
  }

  private async initializeCommands(projectRoot: string): Promise<void> {
    // Register built-in commands
    this.commandRegistry.register(new NewCommand());
    this.commandRegistry.register(new ModelCommand());
    this.commandRegistry.register(new ModeCommand());
    this.commandRegistry.register(new ThemeCommand());
    this.commandRegistry.register(new HelpCommand(this.commandRegistry));

    // Load custom commands
    const customLoader = new CustomCommandLoader(this.fs);
    const customCommands = await customLoader.loadAll(projectRoot);

    // Register custom commands, skip if conflicts with built-in
    customCommands.forEach((cmd) => {
      if (this.commandRegistry.has(cmd.name)) {
        logger.warn('Custom command conflicts with built-in, skipping', {
          name: cmd.name,
        });
        return;
      }
      this.commandRegistry.register(cmd);
    });

    logger.info('Slash commands initialized', {
      total: this.commandRegistry.getAll().length,
    });
  }

  /**
   * Initialize LLM provider with config
   * Returns provider instance or error message
   */
  private async initializeProvider(
    config: Config
  ): Promise<{ provider?: ILLMProvider; error?: string }> {
    try {
      // Use credentials manager for automatic resolution: env → keychain → file
      const { CredentialsManager } = await import('@/shared/utils/CredentialsManager.js');
      const credentialsManager = new CredentialsManager();

      const provider = await ProviderFactory.createFromConfig(
        {
          provider: config.llm.provider,
          model: config.llm.model,
          temperature: config.llm.temperature,
          maxTokens: config.llm.maxTokens,
          baseURL: config.llm.baseURL,
        },
        async (providerId: string) => credentialsManager.getKey(providerId)
      );

      return { provider };
    } catch (error) {
      if (error instanceof ConfigurationError) {
        return { error: error.message };
      }
      if ((error as Error).message?.includes('No API key configured')) {
        return { error: (error as Error).message };
      }
      return { error: `Failed to initialize provider: ${(error as Error).message}` };
    }
  }

  /**
   * Save config changes to project config file
   */
  private async saveConfig(projectRoot: string, config: Config): Promise<void> {
    try {
      const configPath = path.join(projectRoot, '.mimir', 'config.yml');
      const yamlContent = yaml.stringify(config);
      await this.fs.writeFile(configPath, yamlContent);
      logger.info('Config saved', { path: configPath });
    } catch (error) {
      logger.error('Failed to save config', { error });
      throw new Error(`Failed to save config: ${(error as Error).message}`);
    }
  }

  /**
   * Check if task is complex and requires multi-agent orchestration
   */
  private async checkTaskComplexity(
    provider: ILLMProvider,
    userInput: string
  ): Promise<{ isComplex: boolean; reasoning?: string }> {
    const analyzer = new TaskComplexityAnalyzer(provider);

    // Quick heuristic check first (fast, no LLM call)
    if (!analyzer.isLikelyComplex(userInput)) {
      logger.debug('Task is simple based on heuristic check');
      return { isComplex: false };
    }

    // LLM-based analysis (slower, more accurate)
    try {
      const analysis = await analyzer.analyze(userInput);
      logger.info('Task complexity analysis complete', {
        isComplex: analysis.isComplex,
        complexity: analysis.complexityScore,
        suggestedAgents: analysis.suggestedAgents,
      });

      return {
        isComplex: analysis.isComplex,
        reasoning: analysis.reasoning,
      };
    } catch (error) {
      logger.warn('Complexity analysis failed, falling back to simple mode', { error });
      return { isComplex: false };
    }
  }

  /**
   * Generate workflow plan for complex task
   */
  private async generateWorkflowPlan(
    provider: ILLMProvider,
    userInput: string
  ): Promise<WorkflowPlan | null> {
    try {
      // Import RoleRegistry from mimir-agents
      const { RoleRegistry } = await import('@codedir/mimir-agents/core');
      const roleRegistry = new RoleRegistry();

      const decomposer = new TaskDecomposer(provider, roleRegistry);
      const plan = await decomposer.planWorkflow(userInput);

      logger.info('Workflow plan generated', {
        planId: plan.id,
        taskCount: plan.tasks.length,
        executionMode: plan.executionMode,
      });

      return plan;
    } catch (error) {
      logger.error('Failed to generate workflow plan', { error });
      return null;
    }
  }

  /**
   * Process user message through LLM provider
   * Supports multi-part messages (text + images)
   */
  private async processMessage(
    provider: ILLMProvider,
    messages: Message[],
    userInput: MessageContent
  ): Promise<Message> {
    const startTime = Date.now();

    try {
      // Add user message to history
      const userMessage: Message = {
        role: 'user',
        content: messageContentToString(userInput),
      };
      messages.push(userMessage);

      // Call LLM
      const response = await provider.chat(messages);
      const duration = Date.now() - startTime;

      // Create assistant message with metadata
      const assistantMessage: Message = {
        role: 'assistant',
        content: response.content,
        metadata: {
          timestamp: Date.now(),
          duration,
          usage: response.usage,
          cost: provider.calculateCost(response.usage.inputTokens, response.usage.outputTokens),
          model: provider.getModelName(),
          provider: provider.getProviderName(),
        },
      };

      messages.push(assistantMessage);
      return assistantMessage;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('LLM call failed', { error });

      // Return error message
      const errorMessage: Message = {
        role: 'assistant',
        content: `Error: ${(error as Error).message}`,
        metadata: {
          timestamp: Date.now(),
          duration,
          model: provider.getModelName(),
          provider: provider.getProviderName(),
        },
      };

      messages.push(errorMessage);
      return errorMessage;
    }
  }

  /**
   * Handle model switch request
   */
  private async handleModelSwitch(
    state: ChatState,
    cwd: string,
    provider: string,
    model: string | undefined
  ): Promise<void> {
    logger.info('Model switch requested', { provider, model });

    // Validate provider type
    if (!VALID_PROVIDERS.includes(provider as ValidProvider)) {
      state.messages.push({
        role: 'assistant',
        content: `Invalid provider: ${provider}. Valid providers: ${VALID_PROVIDERS.join(', ')}`,
      });
      return;
    }

    // Update config
    state.config.llm.provider = provider as ValidProvider;
    state.config.llm.model = model ?? getDefaultModel(provider);

    // Save config
    try {
      await this.saveConfig(cwd, state.config);

      // Reinitialize provider
      const newProviderResult = await this.initializeProvider(state.config);
      if (newProviderResult.provider) {
        state.provider = newProviderResult.provider;
        state.messages.push({
          role: 'assistant',
          content: 'Switched to ' + provider + (model ? '/' + model : ''),
        });
      } else {
        state.messages.push({
          role: 'assistant',
          content: `Failed to switch: ${newProviderResult.error}`,
        });
      }
    } catch (error) {
      state.messages.push({
        role: 'assistant',
        content: `Failed to save config: ${(error as Error).message}`,
      });
    }
  }

  /**
   * Handle theme change request
   */
  private async handleThemeChange(
    state: ChatState,
    cwd: string,
    theme: string,
    renderUI: () => void
  ): Promise<void> {
    // Create new config object with updated theme to trigger React rerender
    state.config = {
      ...state.config,
      ui: {
        ...state.config.ui,
        theme: theme as ThemeType,
      },
    };

    try {
      await this.saveConfig(cwd, state.config);
      logger.info('Theme changed and saved', { theme });

      // Force immediate rerender with new theme
      renderUI();
    } catch (error) {
      logger.error('Failed to save theme change', { error });
    }
  }

  /**
   * Create workflow orchestrator with proper dependencies
   */
  private async createWorkflowOrchestrator(state: ChatState): Promise<WorkflowOrchestrator> {
    const { RoleRegistry } = await import('@codedir/mimir-agents/core');
    const { FileSystemAdapter } = await import('@codedir/mimir-agents-node/platform');
    const { ProcessExecutorAdapter } = await import('@codedir/mimir-agents-node/platform');

    const roleRegistry = new RoleRegistry();
    const toolRegistry = new ToolRegistry();

    // Create NativeExecutor for tool execution
    const fs = new FileSystemAdapter();
    const processExecutor = new ProcessExecutorAdapter();

    // Build permission config from merged config
    const permissionConfig: PermissionManagerConfig = {
      allowlist: [...(state.config.permissions?.alwaysAcceptCommands || [])],
      blocklist: [],
      acceptRiskLevel: state.config.permissions?.acceptRiskLevel || 'medium',
      autoAccept: state.config.permissions?.autoAccept !== false,
    };

    const executor = new NativeExecutor(fs, processExecutor, permissionConfig, {
      mode: 'native',
      projectDir: process.cwd(),
    });

    // Initialize executor
    await executor.initialize();

    return new WorkflowOrchestrator(roleRegistry, toolRegistry, state.provider!, executor, {
      promptForApproval: false,
    });
  }

  /**
   * Map SubAgentState to AgentProgressData for UI
   */
  private mapAgentStateToProgressData(
    agentState: SubAgentState,
    index: number,
    now: number
  ): AgentProgressData {
    const startTime = agentState.startTime ? agentState.startTime.getTime() : now;
    const endTime = agentState.endTime ? agentState.endTime.getTime() : now;
    const elapsedTime =
      agentState.status === 'completed' || agentState.status === 'failed'
        ? endTime - startTime
        : now - startTime;

    return {
      index: index + 1,
      role: toAgentRole(agentState.agent.role),
      status: mapSubAgentStatus(agentState.status),
      elapsedTime,
      cost: agentState.result?.totalCost || 0,
      tokens: agentState.result?.totalTokens || 0,
      currentTask: agentState.task,
      todoCount: 0,
      currentTodo: undefined,
    };
  }

  /**
   * Handle workflow completion
   */
  private handleWorkflowCompletion(
    state: ChatState,
    plan: WorkflowPlan,
    workflowResult: {
      agents: Array<{
        agentId: string;
        status: string;
        result?: { finalResponse?: string; totalCost?: number; totalTokens?: number };
        error?: string;
      }>;
      totalCost: number;
      totalTokens: number;
    },
    renderUI: () => void
  ): void {
    logger.info('Workflow execution completed', {
      planId: plan.id,
      workflowResult,
    });

    state.workflowStatus = 'completed';

    // Add individual agent result messages for audit trail
    workflowResult.agents.forEach((agent) => {
      const isSuccess = agent.status === 'completed';
      const output = agent.result?.finalResponse ?? agent.error ?? 'Completed';
      state.messages.push({
        role: 'assistant',
        content: `${isSuccess ? 'Agent' : 'Agent failed'} [${agent.agentId}]: ${output}`,
        metadata: {
          timestamp: Date.now(),
          type: 'agent',
          agentName: agent.agentId,
          workflowId: plan.id,
          cost: agent.result?.totalCost,
          usage: agent.result?.totalTokens
            ? {
                inputTokens: 0,
                outputTokens: agent.result.totalTokens,
                totalTokens: agent.result.totalTokens,
              }
            : undefined,
        },
      });
    });

    // Use totals from workflow result
    const totalWorkflowCost = workflowResult.totalCost;
    const totalTokens = workflowResult.totalTokens;

    // Add workflow completion summary
    const successCount = workflowResult.agents.filter((a) => a.status === 'completed').length;
    state.messages.push({
      role: 'assistant',
      content: `Workflow completed with ${successCount}/${workflowResult.agents.length} agents successful`,
      metadata: {
        timestamp: Date.now(),
        type: 'workflow',
        workflowId: plan.id,
        cost: totalWorkflowCost,
        usage: { inputTokens: 0, outputTokens: totalTokens, totalTokens },
      },
    });
    state.totalCost += totalWorkflowCost;

    // Return to chat after brief delay
    setTimeout(() => {
      state.uiMode = 'chat';
      state.pendingWorkflowPlan = undefined;
      state.currentUserInput = undefined;
      state.workflowOrchestrator = undefined;
      renderUI();
    }, 2000);
  }

  /**
   * Handle workflow failure
   */
  private handleWorkflowFailure(state: ChatState, error: Error, renderUI: () => void): void {
    logger.error('Workflow execution failed', { error });

    state.workflowStatus = 'failed';
    state.messages.push({
      role: 'assistant',
      content: `Workflow execution failed: ${error.message}`,
    });

    // Return to chat after brief delay
    setTimeout(() => {
      state.uiMode = 'chat';
      state.pendingWorkflowPlan = undefined;
      state.currentUserInput = undefined;
      state.workflowOrchestrator = undefined;
      renderUI();
    }, 2000);
  }

  /**
   * Start workflow execution after approval
   */
  private async startWorkflowExecution(
    state: ChatState,
    plan: WorkflowPlan,
    renderUI: () => void
  ): Promise<void> {
    if (!state.provider) {
      logger.error('No provider available for workflow execution');
      state.uiMode = 'chat';
      state.messages.push({
        role: 'assistant',
        content: 'Cannot start workflow: No LLM provider configured.',
      });
      renderUI();
      return;
    }

    try {
      const orchestrator = await this.createWorkflowOrchestrator(state);

      // Initialize workflow state
      state.workflowOrchestrator = orchestrator;
      state.workflowStatus = 'running';
      state.workflowStartTime = Date.now();
      state.agentProgressData = [];
      state.uiMode = 'workflow-execution';

      // Add workflow start message
      state.messages.push({
        role: 'assistant',
        content: `Starting multi-agent workflow with ${plan.tasks.length} agent(s)...`,
        metadata: {
          timestamp: Date.now(),
          type: 'workflow',
          workflowId: plan.id,
        },
      });

      // Set up progress polling (500ms intervals)
      const progressInterval = setInterval(() => {
        if (state.uiMode === 'workflow-execution' && state.workflowStatus === 'running') {
          renderUI();
        } else {
          clearInterval(progressInterval);
        }
      }, 500);

      // Start execution (async)
      void orchestrator.executeWorkflow(plan).then(
        (workflowResult) => {
          this.handleWorkflowCompletion(state, plan, workflowResult, renderUI);
        },
        (error: Error) => {
          this.handleWorkflowFailure(state, error, renderUI);
        }
      );

      // Initial render of workflow execution UI
      renderUI();
    } catch (error) {
      logger.error('Failed to start workflow execution', { error });
      state.uiMode = 'chat';
      state.messages.push({
        role: 'assistant',
        content: `Failed to start workflow: ${(error as Error).message}`,
      });
      renderUI();
    }
  }

  /**
   * Handle workflow interruption
   */
  private handleWorkflowInterrupt(state: ChatState, renderUI: () => void): void {
    logger.info('Workflow interrupted by user');
    if (state.workflowOrchestrator) {
      void state.workflowOrchestrator.interrupt();
    }
    state.workflowStatus = 'interrupted';
    state.messages.push({
      role: 'assistant',
      content: 'Workflow interrupted by user.',
    });

    // Return to chat after brief delay
    setTimeout(() => {
      state.uiMode = 'chat';
      state.pendingWorkflowPlan = undefined;
      state.currentUserInput = undefined;
      state.workflowOrchestrator = undefined;
      renderUI();
    }, 1000);
  }

  /**
   * Handle slash command execution
   */
  private async handleSlashCommand(
    state: ChatState,
    cwd: string,
    commandName: string,
    args: string[],
    renderUI: () => void
  ): Promise<void> {
    const result = await this.commandRegistry.execute(commandName, args, {
      currentMode: state.currentMode,
      currentProvider: state.config.llm.provider,
      currentModel: state.config.llm.model ?? 'unknown',
      messageCount: state.messages.length,
      requestModeSwitch: (mode): void => {
        state.currentMode = mode;
        logger.info('Mode switched via command', { mode });
        renderUI();
      },
      requestModelSwitch: async (provider, model): Promise<void> => {
        await this.handleModelSwitch(state, cwd, provider, model);
      },
      requestNewChat: (): void => {
        state.messages = [];
        state.totalCost = 0;
        logger.info('New chat started');
      },
      requestThemeChange: async (theme): Promise<void> => {
        await this.handleThemeChange(state, cwd, theme, renderUI);
      },
      sendPrompt: (prompt): void => {
        // For custom commands - add as user message
        state.messages.push({
          role: 'user',
          content: prompt,
        });
        // TODO: Process through agent
        state.messages.push({
          role: 'assistant',
          content: `Received prompt from command: ${prompt}`,
        });
      },
    });

    if (!result.success) {
      state.messages.push({
        role: 'assistant',
        content: `Error: ${result.error}`,
      });
    }
  }

  /**
   * Handle user input (slash commands or messages)
   */
  private async handleUserInput(
    state: ChatState,
    cwd: string,
    input: MessageContent,
    renderUI: () => void
  ): Promise<void> {
    const inputText = typeof input === 'string' ? input : '';
    const parseResult = SlashCommandParser.parse(inputText);

    if (parseResult.isCommand && parseResult.commandName) {
      // Add command to message history for audit trail
      state.messages.push({
        role: 'user',
        content: inputText,
        metadata: {
          timestamp: Date.now(),
          type: 'command',
          commandName: parseResult.commandName,
        },
      });

      await this.handleSlashCommand(
        state,
        cwd,
        parseResult.commandName,
        parseResult.args || [],
        renderUI
      );
      renderUI();
      return;
    }

    // Normal message handling
    logger.info('User input received', { input });

    // Check if provider is available
    if (!state.provider) {
      state.messages.push({
        role: 'user',
        content: messageContentToString(input),
      });
      state.messages.push({
        role: 'assistant',
        content:
          'No LLM provider configured. Please use /model <provider> <model> to set up a provider.',
      });
      renderUI();
      return;
    }

    // Check task complexity for multi-agent orchestration
    const complexityCheck = await this.checkTaskComplexity(state.provider, inputText);

    if (complexityCheck.isComplex) {
      await this.handleComplexTask(state, input, inputText, renderUI);
    } else {
      await this.handleSimpleTask(state, input, renderUI);
    }
  }

  /**
   * Handle complex task with multi-agent workflow
   */
  private async handleComplexTask(
    state: ChatState,
    input: MessageContent,
    inputText: string,
    renderUI: () => void
  ): Promise<void> {
    logger.info('Complex task detected, generating workflow plan');

    // Add user message to history
    state.messages.push({
      role: 'user',
      content: messageContentToString(input),
    });

    // Generate workflow plan
    const plan = await this.generateWorkflowPlan(state.provider!, inputText);

    if (!plan) {
      // Fallback to simple mode if plan generation failed
      state.messages.push({
        role: 'assistant',
        content: 'Failed to generate workflow plan. Processing with standard mode...',
      });
      await this.processMessage(state.provider!, state.messages, input);
      const lastMessage = state.messages[state.messages.length - 1];
      if (lastMessage?.metadata?.cost) {
        state.totalCost += lastMessage.metadata.cost;
      }
      renderUI();
      return;
    }

    // Show workflow approval UI
    state.uiMode = 'workflow-approval';
    state.pendingWorkflowPlan = plan;
    state.currentUserInput = messageContentToString(input);
    renderUI();
  }

  /**
   * Handle simple task with direct LLM processing
   */
  private async handleSimpleTask(
    state: ChatState,
    input: MessageContent,
    renderUI: () => void
  ): Promise<void> {
    state.messages.push({
      role: 'user',
      content: messageContentToString(input),
    });
    await this.processMessage(state.provider!, state.messages, input);

    // Update total cost
    const lastMessage = state.messages[state.messages.length - 1];
    if (lastMessage?.metadata?.cost) {
      state.totalCost += lastMessage.metadata.cost;
    }

    renderUI();
  }

  /**
   * Create workflow approval UI element
   */
  private createWorkflowApprovalUI(state: ChatState, renderUI: () => void): React.ReactElement {
    return React.createElement(AgentSelectionUI, {
      plan: state.pendingWorkflowPlan!,
      theme: state.config.ui.theme,
      onApprove: (plan: WorkflowPlan): void => {
        logger.info('Workflow approved by user', { planId: plan.id });
        void this.startWorkflowExecution(state, plan, renderUI);
      },
      onCancel: (): void => {
        logger.info('Workflow cancelled by user');
        state.uiMode = 'chat';
        state.pendingWorkflowPlan = undefined;
        state.currentUserInput = undefined;
        state.messages.push({
          role: 'assistant',
          content: 'Workflow cancelled. Returning to chat...',
        });
        renderUI();
      },
      onEdit: (): void => {
        logger.info('Workflow edit requested');
        state.uiMode = 'chat';
        state.pendingWorkflowPlan = undefined;
        state.messages.push({
          role: 'assistant',
          content: 'Edit mode: Please enter your revised task description.',
        });
        renderUI();
      },
    });
  }

  /**
   * Create workflow execution UI element
   */
  private createWorkflowExecutionUI(state: ChatState, renderUI: () => void): React.ReactElement {
    // Update agent progress data from orchestrator
    if (state.workflowOrchestrator) {
      const agents = state.workflowOrchestrator.getAgents();
      const now = Date.now();
      state.agentProgressData = agents.map((agentState, index) =>
        this.mapAgentStateToProgressData(agentState, index, now)
      );
    }

    // Calculate totals
    const totalElapsedTime = Date.now() - state.workflowStartTime;
    const totalCost = state.agentProgressData.reduce((sum, a) => sum + a.cost, 0);
    const totalTokens = state.agentProgressData.reduce((sum, a) => sum + a.tokens, 0);

    return React.createElement(MultiAgentProgressView, {
      agents: state.agentProgressData,
      theme: state.config.ui.theme,
      workflowStatus: state.workflowStatus,
      totalElapsedTime,
      totalCost,
      totalTokens,
      onGetAgentDetails: (_agentIndex: number) => {
        // TODO: Return detailed agent data
        return null;
      },
      onInterrupt: (): void => {
        this.handleWorkflowInterrupt(state, renderUI);
      },
    });
  }

  /**
   * Create chat UI element
   */
  private createChatUI(
    state: ChatState,
    cwd: string,
    renderUI: () => void,
    onExit: () => void
  ): React.ReactElement {
    return React.createElement(ChatApp, {
      fs: this.fs,
      projectRoot: process.cwd(),
      config: state.config,
      messages: state.messages,
      currentMode: state.currentMode,
      totalCost: state.totalCost,
      commandRegistry: this.commandRegistry,
      onUserInput: (input: MessageContent): void => {
        void this.handleUserInput(state, cwd, input, renderUI);
      },
      onModeSwitch: (mode: 'plan' | 'act' | 'discuss'): void => {
        state.currentMode = mode;
        logger.info('Mode switched', { mode });
        renderUI();
      },
      onExit: onExit,
    });
  }

  /**
   * Initialize workspace if needed
   */
  private async ensureWorkspaceInitialized(cwd: string): Promise<void> {
    const initializer = new MimirInitializer(this.fs, this.configLoader);
    if (!(await initializer.isWorkspaceInitialized(cwd))) {
      logger.info('Workspace not initialized. Running setup...');
      const result = await initializer.initializeWorkspace(cwd);

      if (!result.success) {
        const errorMsg = 'Failed to initialize workspace: ' + result.errors.join(', ');
        logger.error(errorMsg);
        throw new Error('Workspace initialization failed');
      }

      logger.info('Workspace initialized successfully');
    }
  }

  /**
   * Create initial chat state
   */
  private createInitialState(
    config: Config,
    provider: ILLMProvider | undefined,
    providerError: string | undefined
  ): ChatState {
    const state: ChatState = {
      messages: [],
      currentMode: 'discuss',
      totalCost: 0,
      provider,
      config,
      uiMode: 'chat',
      pendingWorkflowPlan: undefined,
      currentUserInput: undefined,
      workflowOrchestrator: undefined,
      workflowStatus: 'running',
      workflowStartTime: 0,
      agentProgressData: [],
    };

    // Show welcome message or error if provider not configured
    if (!provider && providerError) {
      state.messages.push({
        role: 'assistant',
        content: `${providerError}\n\nTo use the chat, you need to:\n1. Set up an API key as an environment variable (e.g., DEEPSEEK_API_KEY or ANTHROPIC_API_KEY)\n2. Or use /model <provider> <model> to switch to a configured provider\n\nAvailable providers: deepseek, anthropic`,
      });
    }

    return state;
  }

  async execute(workspaceRoot?: string): Promise<void> {
    const cwd = workspaceRoot ?? process.cwd();

    // Check if first run
    if (await this.firstRunDetector.isFirstRun()) {
      logger.info('First run detected, launching setup wizard');
      await this.setupCommand.execute();
    }

    // Auto-initialize workspace if .mimir doesn't exist
    await this.ensureWorkspaceInitialized(cwd);

    // Enter alternate screen buffer
    process.stdout.write('\x1b[?1049h');

    // Load configuration
    const { config } = await this.configLoader.load({ projectRoot: cwd });

    // Initialize slash commands
    await this.initializeCommands(cwd);

    // Initialize LLM provider
    const providerResult = await this.initializeProvider(config);

    // Initialize chat state
    const state = this.createInitialState(config, providerResult.provider, providerResult.error);

    return new Promise((resolve) => {
      this.runChatLoop(state, config, cwd, resolve);
    });
  }

  /**
   * Run the main chat loop with Ink rendering
   */
  private runChatLoop(state: ChatState, config: Config, cwd: string, resolve: () => void): void {
    // Render function to update UI
    const renderUI = (rerender: (element: React.ReactElement) => void): void => {
      let element: React.ReactElement;

      if (state.uiMode === 'workflow-approval' && state.pendingWorkflowPlan) {
        element = this.createWorkflowApprovalUI(state, () => renderUI(rerender));
      } else if (state.uiMode === 'workflow-execution' && state.workflowOrchestrator) {
        element = this.createWorkflowExecutionUI(state, () => renderUI(rerender));
      } else {
        element = this.createChatUI(
          state,
          cwd,
          () => renderUI(rerender),
          () => {
            logger.info('Chat session ended');
            process.stdout.write('\x1b[?1049l');
            resolve();
          }
        );
      }

      rerender(element);
    };

    // Disable console logging while Ink UI is active
    logger.disableConsole();

    const { waitUntilExit, rerender, clear } = render(
      this.createChatUI(
        state,
        cwd,
        () => renderUI(rerender),
        () => {
          logger.info('Chat session ended');
          process.stdout.write('\x1b[?1049l');
          resolve();
        }
      ),
      {
        patchConsole: false,
        exitOnCtrlC: false,
      }
    );

    // Handle process termination with SignalHandler
    const signalHandler = installSignalHandlers({
      keyBindings: config.keyBindings,
      onCleanup: async () => {
        logger.enableConsole();
        process.stdout.write('\x1b[?1049l');
        clear();
        logger.info('Chat interface cleanup completed');
      },
      emergencyExitCount: 3,
      cleanupTimeout: 5000,
    });

    waitUntilExit()
      .then(() => {
        logger.enableConsole();
        logger.info('Chat interface exited');
        process.stdout.write('\x1b[?1049l');
        signalHandler.uninstall();
        resolve();
      })
      .catch((error: unknown) => {
        logger.error('Error during UI cleanup', { error });
        logger.enableConsole();
        process.stdout.write('\x1b[?1049l');
        signalHandler.uninstall();
        resolve();
      });
  }
}
