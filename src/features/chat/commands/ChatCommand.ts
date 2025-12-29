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
import { TaskDecomposer, WorkflowOrchestrator } from '@codedir/mimir-agents/orchestration';
import { WorkflowPlan, AgentStatus } from '@codedir/mimir-agents/core';
import { ToolRegistry } from '@codedir/mimir-agents/tools';
import { NativeExecutor } from '@codedir/mimir-agents-node/execution';
import { AgentSelectionUI } from '@/features/chat/components/AgentSelectionUI.js';
import { MultiAgentProgressView } from '@/features/chat/components/MultiAgentProgressView.js';
import { AgentProgressData } from '@/features/chat/components/AgentProgressRow.js';
import path from 'path';
import yaml from 'yaml';

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
      if (error.message?.includes('No API key configured')) {
        return { error: error.message };
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
        content: userInput,
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
        content: `❌ Error: ${(error as Error).message}`,
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

  async execute(workspaceRoot?: string): Promise<void> {
    // Use provided workspace root or fall back to process.cwd()
    // In production, this should be passed from CLI entry point
    const cwd = workspaceRoot ?? process.cwd();

    // Check if first run
    if (await this.firstRunDetector.isFirstRun()) {
      logger.info('First run detected, launching setup wizard');
      await this.setupCommand.execute();
      // Wizard exits alternate screen buffer on completion, returning to main buffer
    }

    // Auto-initialize workspace if .mimir doesn't exist
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

    // Enter alternate screen buffer to prevent layout shifts
    // This ensures the app renders in a separate buffer and doesn't push content down
    process.stdout.write('\x1b[?1049h');

    // Load configuration
    const { config } = await this.configLoader.load({
      projectRoot: cwd,
    });

    // Initialize slash commands
    await this.initializeCommands(cwd);

    // Initialize LLM provider
    let providerResult = await this.initializeProvider(config);

    // Initialize chat state
    const state = {
      messages: [] as Message[],
      currentMode: 'discuss' as 'plan' | 'act' | 'discuss',
      totalCost: 0,
      provider: providerResult.provider,
      config,
      // UI mode tracking for workflow approval
      uiMode: 'chat' as 'chat' | 'workflow-approval' | 'workflow-execution',
      pendingWorkflowPlan: undefined as WorkflowPlan | undefined,
      currentUserInput: undefined as string | undefined,
      // Workflow execution state
      workflowOrchestrator: undefined as WorkflowOrchestrator | undefined,
      workflowStatus: 'running' as 'running' | 'completed' | 'failed' | 'interrupted',
      workflowStartTime: 0,
      agentProgressData: [] as AgentProgressData[],
    };

    // Show welcome message or error if provider not configured
    if (!state.provider && providerResult.error) {
      state.messages.push({
        role: 'assistant',
        content: `⚠️  ${providerResult.error}\n\nTo use the chat, you need to:\n1. Set up an API key as an environment variable (e.g., DEEPSEEK_API_KEY or ANTHROPIC_API_KEY)\n2. Or use /model <provider> <model> to switch to a configured provider\n\nAvailable providers: deepseek, anthropic`,
      });
    }

    return new Promise((resolve) => {
      // Render function to update UI
      const renderUI = (rerender: (element: React.ReactElement) => void): void => {
        let element: React.ReactElement;

        // Conditional rendering based on UI mode
        if (state.uiMode === 'workflow-approval' && state.pendingWorkflowPlan) {
          // Show workflow approval UI
          element = React.createElement(AgentSelectionUI, {
            plan: state.pendingWorkflowPlan,
            theme: state.config.ui.theme,
            onApprove: async (plan: WorkflowPlan) => {
              logger.info('Workflow approved by user', {
                planId: plan.id,
              });

              if (!state.provider) {
                logger.error('No provider available for workflow execution');
                state.uiMode = 'chat';
                state.messages.push({
                  role: 'assistant',
                  content: '❌ Cannot start workflow: No LLM provider configured.',
                });
                renderUI(rerender);
                return;
              }

              try {
                // Create WorkflowOrchestrator with proper dependencies
                const { RoleRegistry, PermissionManagerConfig } =
                  await import('@codedir/mimir-agents/core');
                const { FileSystemAdapter } = await import('@codedir/mimir-agents-node/platform');
                const { ProcessExecutorAdapter } =
                  await import('@codedir/mimir-agents-node/platform');

                const roleRegistry = new RoleRegistry();
                const toolRegistry = new ToolRegistry();

                // Create NativeExecutor for tool execution
                const fs = new FileSystemAdapter();
                const processExecutor = new ProcessExecutorAdapter();

                // Build permission config from merged config
                const permissionConfig: PermissionManagerConfig = {
                  allowlist: [
                    ...(state.config.enforcement?.globalAllowlist || []),
                    ...(state.config.permissions?.alwaysAcceptCommands || []),
                  ],
                  blocklist: state.config.enforcement?.globalBlocklist || [],
                  acceptRiskLevel: state.config.permissions?.acceptRiskLevel || 'medium',
                  autoAccept: state.config.permissions?.autoAccept !== false,
                };

                const executor = new NativeExecutor(fs, processExecutor, permissionConfig, {
                  mode: 'native',
                  projectDir: process.cwd(),
                });

                // Initialize executor
                await executor.initialize();

                const orchestrator = new WorkflowOrchestrator(
                  roleRegistry,
                  toolRegistry,
                  state.provider,
                  executor,
                  { promptForApproval: false }
                );

                // Initialize workflow state
                state.workflowOrchestrator = orchestrator;
                state.workflowStatus = 'running';
                state.workflowStartTime = Date.now();
                state.agentProgressData = [];
                state.uiMode = 'workflow-execution';

                // Set up progress polling (500ms intervals)
                const progressInterval = setInterval(() => {
                  if (state.uiMode === 'workflow-execution' && state.workflowStatus === 'running') {
                    renderUI(rerender);
                  } else {
                    clearInterval(progressInterval);
                  }
                }, 500);

                // Start execution (async)
                void orchestrator.executeWorkflow(plan).then(
                  (results) => {
                    logger.info('Workflow execution completed', {
                      planId: plan.id,
                      results,
                    });

                    state.workflowStatus = 'completed';

                    // Collect results and add to messages
                    state.messages.push({
                      role: 'assistant',
                      content: `✓ Workflow completed successfully!\n\nResults:\n${results.map((r) => `- ${r.role}: ${r.success ? '✓' : '✗'} ${r.output || r.error}`).join('\n')}`,
                    });

                    // Calculate total cost from all agents
                    const totalWorkflowCost = results.reduce((sum, r) => sum + (r.cost || 0), 0);
                    state.totalCost += totalWorkflowCost;

                    // Return to chat after brief delay
                    setTimeout(() => {
                      state.uiMode = 'chat';
                      state.pendingWorkflowPlan = undefined;
                      state.currentUserInput = undefined;
                      state.workflowOrchestrator = undefined;
                      renderUI(rerender);
                    }, 2000);
                  },
                  (error) => {
                    logger.error('Workflow execution failed', { error });

                    state.workflowStatus = 'failed';
                    state.messages.push({
                      role: 'assistant',
                      content: `❌ Workflow execution failed: ${(error as Error).message}`,
                    });

                    // Return to chat after brief delay
                    setTimeout(() => {
                      state.uiMode = 'chat';
                      state.pendingWorkflowPlan = undefined;
                      state.currentUserInput = undefined;
                      state.workflowOrchestrator = undefined;
                      renderUI(rerender);
                    }, 2000);
                  }
                );

                // Initial render of workflow execution UI
                renderUI(rerender);
              } catch (error) {
                logger.error('Failed to start workflow execution', { error });
                state.uiMode = 'chat';
                state.messages.push({
                  role: 'assistant',
                  content: `❌ Failed to start workflow: ${(error as Error).message}`,
                });
                renderUI(rerender);
              }
            },
            onCancel: () => {
              logger.info('Workflow cancelled by user');
              state.uiMode = 'chat';
              state.pendingWorkflowPlan = undefined;
              state.currentUserInput = undefined;
              state.messages.push({
                role: 'assistant',
                content: '❌ Workflow cancelled. Returning to chat...',
              });
              renderUI(rerender);
            },
            onEdit: () => {
              logger.info('Workflow edit requested');

              // Return to chat to allow user to edit the input
              state.uiMode = 'chat';
              state.pendingWorkflowPlan = undefined;
              state.messages.push({
                role: 'assistant',
                content: 'ℹ️ Edit mode: Please enter your revised task description.',
              });
              renderUI(rerender);
            },
          });
        } else if (state.uiMode === 'workflow-execution' && state.workflowOrchestrator) {
          // Show workflow execution progress UI

          // Update agent progress data from orchestrator
          if (state.workflowOrchestrator) {
            const agents = state.workflowOrchestrator.getAgents();
            state.agentProgressData = agents.map((agentState, index) => {
              // Calculate elapsed time
              const now = Date.now();
              const startTime = agentState.startTime ? agentState.startTime.getTime() : now;
              const endTime = agentState.endTime ? agentState.endTime.getTime() : now;
              const elapsedTime =
                agentState.status === 'completed' || agentState.status === 'failed'
                  ? endTime - startTime
                  : now - startTime;

              return {
                index: index + 1,
                role: agentState.agent.config.role,
                status: agentState.status,
                elapsedTime,
                cost: agentState.result?.totalCost || 0,
                tokens: agentState.result?.totalTokens || 0,
                currentTask: agentState.task,
                todoCount: 0, // Not available in SubAgentState
                currentTodo: undefined, // Not available in SubAgentState
              };
            });
          }

          // Calculate totals
          const totalElapsedTime = Date.now() - state.workflowStartTime;
          const totalCost = state.agentProgressData.reduce((sum, a) => sum + a.cost, 0);
          const totalTokens = state.agentProgressData.reduce((sum, a) => sum + a.tokens, 0);

          element = React.createElement(MultiAgentProgressView, {
            agents: state.agentProgressData,
            theme: state.config.ui.theme,
            workflowStatus: state.workflowStatus,
            totalElapsedTime,
            totalCost,
            totalTokens,
            onGetAgentDetails: (agentIndex: number) => {
              // TODO: Return detailed agent data
              return null;
            },
            onInterrupt: () => {
              logger.info('Workflow interrupted by user');
              if (state.workflowOrchestrator) {
                state.workflowOrchestrator.interrupt();
              }
              state.workflowStatus = 'interrupted';
              state.messages.push({
                role: 'assistant',
                content: '⏸ Workflow interrupted by user.',
              });

              // Return to chat after brief delay
              setTimeout(() => {
                state.uiMode = 'chat';
                state.pendingWorkflowPlan = undefined;
                state.currentUserInput = undefined;
                state.workflowOrchestrator = undefined;
                renderUI(rerender);
              }, 1000);
            },
          });
        } else {
          // Default: show chat UI
          element = React.createElement(ChatApp, {
            fs: this.fs,
            projectRoot: process.cwd(),
            config: state.config,
            messages: state.messages,
            currentMode: state.currentMode,
            totalCost: state.totalCost,
            commandRegistry: this.commandRegistry,
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onUserInput: async (input: MessageContent) => {
              // Extract text for slash command parsing (only works with string content)
              const inputText = typeof input === 'string' ? input : '';
              const parseResult = SlashCommandParser.parse(inputText);

              if (parseResult.isCommand && parseResult.commandName) {
                // Execute slash command
                const result = await this.commandRegistry.execute(
                  parseResult.commandName,
                  parseResult.args || [],
                  {
                    currentMode: state.currentMode,
                    currentProvider: state.config.llm.provider,
                    currentModel: state.config.llm.model,
                    messageCount: state.messages.length,
                    requestModeSwitch: (mode): void => {
                      state.currentMode = mode;
                      logger.info('Mode switched via command', { mode });
                      // Force rerender to update mode colors (MimirHeader logo, etc.)
                      renderUI(rerender);
                    },
                    requestModelSwitch: async (provider, model): Promise<void> => {
                      logger.info('Model switch requested', { provider, model });

                      // Validate provider type
                      const validProviders = [
                        'deepseek',
                        'anthropic',
                        'openai',
                        'google',
                        'gemini',
                        'qwen',
                        'ollama',
                      ] as const;
                      if (!validProviders.includes(provider as (typeof validProviders)[number])) {
                        state.messages.push({
                          role: 'assistant',
                          content: `❌ Invalid provider: ${provider}. Valid providers: ${validProviders.join(', ')}`,
                        });
                        return;
                      }

                      // Update config
                      state.config.llm.provider = provider as (typeof validProviders)[number];

                      // Set model - use provided model or default for provider
                      if (model) {
                        state.config.llm.model = model;
                      } else {
                        // Set default model for provider
                        switch (provider.toLowerCase()) {
                          case 'deepseek':
                            state.config.llm.model = 'deepseek-chat';
                            break;
                          case 'anthropic':
                            state.config.llm.model = 'claude-sonnet-4-5-20250929';
                            break;
                          case 'openai':
                            state.config.llm.model = 'gpt-4';
                            break;
                          case 'google':
                          case 'gemini':
                            state.config.llm.model = 'gemini-pro';
                            break;
                          default:
                            state.config.llm.model = provider; // fallback
                        }
                      }

                      // Save config
                      try {
                        await this.saveConfig(cwd, state.config);

                        // Reinitialize provider
                        const newProviderResult = await this.initializeProvider(state.config);
                        if (newProviderResult.provider) {
                          state.provider = newProviderResult.provider;
                          state.messages.push({
                            role: 'assistant',
                            content: `✓ Switched to ${provider}${model ? `/${model}` : ''}`,
                          });
                        } else {
                          state.messages.push({
                            role: 'assistant',
                            content: `❌ Failed to switch: ${newProviderResult.error}`,
                          });
                        }
                      } catch (error) {
                        state.messages.push({
                          role: 'assistant',
                          content: `❌ Failed to save config: ${(error as Error).message}`,
                        });
                      }
                    },
                    requestNewChat: (): void => {
                      state.messages = [];
                      state.totalCost = 0;
                      logger.info('New chat started');
                    },
                    requestThemeChange: async (theme): Promise<void> => {
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
                        renderUI(rerender);
                      } catch (error) {
                        logger.error('Failed to save theme change', { error });
                      }
                    },
                    sendPrompt: (prompt) => {
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
                  }
                );

                if (!result.success) {
                  // Show error message
                  state.messages.push({
                    role: 'assistant',
                    content: `Error: ${result.error}`,
                  });
                }

                // Re-render
                renderUI(rerender);
                return;
              }

              // Normal message handling
              logger.info('User input received', { input });

              // Check if provider is available
              if (!state.provider) {
                state.messages.push({
                  role: 'user',
                  content: input,
                });
                state.messages.push({
                  role: 'assistant',
                  content:
                    '❌ No LLM provider configured. Please use /model <provider> <model> to set up a provider.',
                });
                renderUI(rerender);
                return;
              }

              // Check task complexity for multi-agent orchestration
              const complexityCheck = await this.checkTaskComplexity(state.provider, input);

              if (complexityCheck.isComplex) {
                // Complex task detected - generate workflow plan
                logger.info('Complex task detected, generating workflow plan', {
                  reasoning: complexityCheck.reasoning,
                });

                // Add user message to history
                state.messages.push({
                  role: 'user',
                  content: input,
                });

                // Generate workflow plan
                const plan = await this.generateWorkflowPlan(state.provider, input);

                if (!plan) {
                  // Fallback to simple mode if plan generation failed
                  state.messages.push({
                    role: 'assistant',
                    content:
                      '⚠️ Failed to generate workflow plan. Processing with standard mode...',
                  });
                  await this.processMessage(state.provider, state.messages, input);
                  const lastMessage = state.messages[state.messages.length - 1];
                  if (lastMessage?.metadata?.cost) {
                    state.totalCost += lastMessage.metadata.cost;
                  }
                  renderUI(rerender);
                  return;
                }

                // Show workflow approval UI
                state.uiMode = 'workflow-approval';
                state.pendingWorkflowPlan = plan;
                state.currentUserInput = input;
                renderUI(rerender);
                return; // Don't process message yet - wait for user approval
              } else {
                // Simple task - process through LLM directly
                state.messages.push({
                  role: 'user',
                  content: input,
                });
                await this.processMessage(state.provider, state.messages, input);

                // Update total cost
                const lastMessage = state.messages[state.messages.length - 1];
                if (lastMessage?.metadata?.cost) {
                  state.totalCost += lastMessage.metadata.cost;
                }

                // Re-render with updated messages
                renderUI(rerender);
              }
            },
            onModeSwitch: (mode: 'plan' | 'act' | 'discuss'): void => {
              state.currentMode = mode;
              logger.info('Mode switched', { mode });
              // Force rerender to sync mode changes (e.g., from Shift+Tab)
              renderUI(rerender);
            },
            onExit: (): void => {
              logger.info('Chat session ended');
              // Exit alternate screen buffer before resolving
              process.stdout.write('\x1b[?1049l');
              resolve();
            },
          });
        }

        rerender(element);
      };

      // Disable console logging while Ink UI is active to prevent log pollution
      logger.disableConsole();

      // NOTE: Do NOT manually call process.stdin.setRawMode()!
      // Ink manages raw mode internally via its stdin handling.
      // Manual manipulation causes UV_HANDLE_CLOSING crashes on exit.

      const { waitUntilExit, rerender, clear } = render(
        React.createElement(ChatApp, {
          fs: this.fs,
          projectRoot: process.cwd(),
          config: state.config,
          messages: state.messages,
          currentMode: state.currentMode,
          totalCost: state.totalCost,
          commandRegistry: this.commandRegistry,
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          onUserInput: async (input: MessageContent) => {
            // Extract text for slash command parsing (only works with string content)
            const inputText = typeof input === 'string' ? input : '';
            const parseResult = SlashCommandParser.parse(inputText);

            if (parseResult.isCommand && parseResult.commandName) {
              // Execute slash command
              const result = await this.commandRegistry.execute(
                parseResult.commandName,
                parseResult.args || [],
                {
                  currentMode: state.currentMode,
                  currentProvider: state.config.llm.provider,
                  currentModel: state.config.llm.model,
                  messageCount: state.messages.length,
                  requestModeSwitch: (mode): void => {
                    state.currentMode = mode;
                    logger.info('Mode switched via command', { mode });
                    // Force rerender to update mode colors (MimirHeader logo, etc.)
                    renderUI(rerender);
                  },
                  requestModelSwitch: async (provider, model): Promise<void> => {
                    logger.info('Model switch requested', { provider, model });

                    // Validate provider type
                    const validProviders = [
                      'deepseek',
                      'anthropic',
                      'openai',
                      'google',
                      'gemini',
                      'qwen',
                      'ollama',
                    ] as const;
                    if (!validProviders.includes(provider as (typeof validProviders)[number])) {
                      state.messages.push({
                        role: 'assistant',
                        content: `❌ Invalid provider: ${provider}. Valid providers: ${validProviders.join(', ')}`,
                      });
                      return;
                    }

                    // Update config
                    state.config.llm.provider = provider as (typeof validProviders)[number];

                    // Set model - use provided model or default for provider
                    if (model) {
                      state.config.llm.model = model;
                    } else {
                      // Set default model for provider
                      switch (provider.toLowerCase()) {
                        case 'deepseek':
                          state.config.llm.model = 'deepseek-chat';
                          break;
                        case 'anthropic':
                          state.config.llm.model = 'claude-sonnet-4-5-20250929';
                          break;
                        case 'openai':
                          state.config.llm.model = 'gpt-4';
                          break;
                        case 'google':
                        case 'gemini':
                          state.config.llm.model = 'gemini-pro';
                          break;
                        default:
                          state.config.llm.model = provider; // fallback
                      }
                    }

                    // Save config
                    try {
                      await this.saveConfig(cwd, state.config);

                      // Reinitialize provider
                      const newProviderResult = await this.initializeProvider(state.config);
                      if (newProviderResult.provider) {
                        state.provider = newProviderResult.provider;
                        state.messages.push({
                          role: 'assistant',
                          content: `✓ Switched to ${provider}${model ? `/${model}` : ''}`,
                        });
                      } else {
                        state.messages.push({
                          role: 'assistant',
                          content: `❌ Failed to switch: ${newProviderResult.error}`,
                        });
                      }
                    } catch (error) {
                      state.messages.push({
                        role: 'assistant',
                        content: `❌ Failed to save config: ${(error as Error).message}`,
                      });
                    }
                  },
                  requestNewChat: (): void => {
                    state.messages = [];
                    state.totalCost = 0;
                    logger.info('New chat started');
                  },
                  requestThemeChange: async (theme): Promise<void> => {
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
                      renderUI(rerender);
                    } catch (error) {
                      logger.error('Failed to save theme change', { error });
                    }
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
                }
              );

              if (!result.success) {
                // Show error message
                state.messages.push({
                  role: 'assistant',
                  content: `Error: ${result.error}`,
                });
              }

              // Re-render
              renderUI(rerender);
              return;
            }

            // Normal message handling
            logger.info('User input received', { input });

            // Check if provider is available
            if (!state.provider) {
              state.messages.push({
                role: 'user',
                content: input,
              });
              state.messages.push({
                role: 'assistant',
                content:
                  '❌ No LLM provider configured. Please use /model <provider> <model> to set up a provider.',
              });
              renderUI(rerender);
              return;
            }

            // Check task complexity for multi-agent orchestration
            const complexityCheck = await this.checkTaskComplexity(state.provider, input);

            if (complexityCheck.isComplex) {
              // TODO: Multi-agent workflow
              // For now, add a message indicating detection and fall back to simple mode
              logger.info('Complex task detected, multi-agent workflow not yet implemented', {
                reasoning: complexityCheck.reasoning,
              });

              state.messages.push({
                role: 'assistant',
                content: `🤖 Complex task detected: ${complexityCheck.reasoning}\n\n_Multi-agent workflow coming soon. Processing with standard mode for now..._`,
              });

              // Fallback to simple LLM processing
              await this.processMessage(state.provider, state.messages, input);
            } else {
              // Simple task - process through LLM directly
              await this.processMessage(state.provider, state.messages, input);
            }

            // Update total cost
            const lastMessage = state.messages[state.messages.length - 1];
            if (lastMessage?.metadata?.cost) {
              state.totalCost += lastMessage.metadata.cost;
            }

            renderUI(rerender);
          },
          onModeSwitch: (mode: 'plan' | 'act' | 'discuss'): void => {
            state.currentMode = mode;
            logger.info('Mode switched', { mode });
            // Force rerender to sync mode changes (e.g., from Shift+Tab)
            renderUI(rerender);
          },
          onExit: (): void => {
            logger.info('Chat session ended');
            // Exit alternate screen buffer before resolving
            process.stdout.write('\x1b[?1049l');
            resolve();
          },
        }),
        {
          // Prevent console patching to avoid layout shifts from console.log
          patchConsole: false,
          // CRITICAL: Disable Ink's default Ctrl+C exit behavior
          // We handle Ctrl+C manually through our keyboard system
          exitOnCtrlC: false,
        }
      );

      // Handle process termination with SignalHandler
      const signalHandler = installSignalHandlers({
        keyBindings: config.keyBindings,
        onCleanup: async () => {
          // Re-enable console logging for cleanup messages
          logger.enableConsole();
          // NOTE: Do NOT call setRawMode here - Ink handles cleanup
          // Manually restoring raw mode causes UV_HANDLE_CLOSING crashes
          // Exit alternate screen buffer
          process.stdout.write('\x1b[?1049l');
          // Clear Ink render
          clear();
          logger.info('Chat interface cleanup completed');
        },
        emergencyExitCount: 3,
        cleanupTimeout: 5000,
      });

      waitUntilExit()
        .then(() => {
          // Re-enable console logging after UI exits
          logger.enableConsole();
          logger.info('Chat interface exited');
          // NOTE: Do NOT call setRawMode here - Ink handles cleanup
          // Exit alternate screen buffer on normal exit
          process.stdout.write('\x1b[?1049l');
          // Remove signal handlers
          signalHandler.uninstall();
          resolve();
        })
        .catch((error) => {
          logger.error('Error during UI cleanup', { error });
          // Re-enable console and exit alternate screen even on error
          logger.enableConsole();
          process.stdout.write('\x1b[?1049l');
          signalHandler.uninstall();
          resolve();
        });
    });
  }
}
