/**
 * Chat command handler
 * Main interactive chat session
 */

import React from 'react';
import { render } from 'ink';
import { ChatApp } from '../components/ChatApp.js';
import { ConfigLoader } from '../../config/ConfigLoader.js';
import { Config, Theme as ThemeType } from '../../config/schemas.js';
import { FirstRunDetector } from '../utils/firstRunDetector.js';
import { SetupCommand } from './SetupCommand.js';
import { IFileSystem } from '../../platform/IFileSystem.js';
import { Message } from '../../types/index.js';
import { logger } from '../../utils/logger.js';
import { SlashCommandRegistry } from '../../core/SlashCommand.js';
import { CustomCommandLoader } from '../../core/CustomCommandLoader.js';
import { SlashCommandParser } from '../../core/SlashCommandParser.js';
import { installSignalHandlers } from '../utils/signalHandler.js';
import {
  NewCommand,
  ModelCommand,
  ModeCommand,
  HelpCommand,
  ThemeCommand,
} from './slashCommands/index.js';
import { MimirInitializer } from '../../core/MimirInitializer.js';
import { ProviderFactory } from '../../providers/ProviderFactory.js';
import { ILLMProvider } from '../../providers/ILLMProvider.js';
import { ConfigurationError } from '../../utils/errors.js';
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
  private initializeProvider(config: Config): { provider?: ILLMProvider; error?: string } {
    try {
      const provider = ProviderFactory.create(config.llm);
      return { provider };
    } catch (error) {
      if (error instanceof ConfigurationError) {
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
   * Process user message through LLM provider
   */
  private async processMessage(
    provider: ILLMProvider,
    messages: Message[],
    userInput: string
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
    let providerResult = this.initializeProvider(config);

    // Initialize chat state
    const state = {
      messages: [] as Message[],
      currentMode: 'discuss' as 'plan' | 'act' | 'discuss',
      totalCost: 0,
      provider: providerResult.provider,
      config,
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
        const element = React.createElement(ChatApp, {
          fs: this.fs,
          projectRoot: process.cwd(),
          config: state.config,
          messages: state.messages,
          currentMode: state.currentMode,
          totalCost: state.totalCost,
          commandRegistry: this.commandRegistry,
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          onUserInput: async (input: string) => {
            // Parse for slash command
            const parseResult = SlashCommandParser.parse(input);

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
                      const newProviderResult = this.initializeProvider(state.config);
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

            // Process through LLM
            await this.processMessage(state.provider, state.messages, input);

            // Update total cost
            const lastMessage = state.messages[state.messages.length - 1];
            if (lastMessage?.metadata?.cost) {
              state.totalCost += lastMessage.metadata.cost;
            }

            // Re-render with updated messages
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
            resolve();
          },
        });

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
          onUserInput: async (input: string) => {
            // Parse for slash command
            const parseResult = SlashCommandParser.parse(input);

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
                      const newProviderResult = this.initializeProvider(state.config);
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

            // Process through LLM
            await this.processMessage(state.provider, state.messages, input);

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
