/**
 * Configuration loader with hierarchy support
 * Priority: CLI flags > env vars > project config > global config > defaults
 */

import { Config, ConfigSchema } from './schemas.js';
import type { IFileSystem } from '@codedir/mimir-agents';
import { AllowlistLoader, Allowlist } from './AllowlistLoader.js';
import yaml from 'yaml';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { logger } from '@/shared/utils/logger.js';

export interface ConfigLoadOptions {
  projectRoot?: string;
  cliFlags?: Partial<Config>;
}

export interface ConfigLoadResult {
  config: Config;
  allowlist: Allowlist;
}

export class ConfigLoader {
  private allowlistLoader: AllowlistLoader;

  constructor(private fs: IFileSystem) {
    this.allowlistLoader = new AllowlistLoader(fs);
  }

  /**
   * Load configuration with full hierarchy:
   * 1. Default config
   * 2. Global (~/.mimir/config.yml)
   * 3. Project (.mimir/config.yml)
   * 4. Environment variables (.env)
   * 5. CLI flags
   *
   * Also loads allowlist from:
   * 1. Global (~/.mimir/allowlist.yml)
   * 2. Project (.mimir/allowlist.yml)
   */
  async load(options: ConfigLoadOptions = {}): Promise<ConfigLoadResult> {
    // 1. Start with defaults
    let config = this.getDefaults();

    // 2. Load global config
    const globalConfig = await this.loadGlobalConfig();
    if (globalConfig) {
      config = this.merge(config, globalConfig);
    }

    // 3. Load project config
    if (options.projectRoot) {
      const projectConfig = await this.loadProjectConfig(options.projectRoot);
      if (projectConfig) {
        config = this.merge(config, projectConfig);
      }
    }

    // 4. Load .env file
    const envConfig = this.loadEnvConfig(options.projectRoot);
    if (envConfig) {
      config = this.merge(config, envConfig);
    }

    // 5. Apply CLI flags
    if (options.cliFlags) {
      config = this.merge(config, options.cliFlags);
    }

    // Validate final config
    const validatedConfig = ConfigSchema.parse(config);

    // Load allowlists
    const globalAllowlist = await this.allowlistLoader.loadGlobalAllowlist();
    const projectAllowlist = options.projectRoot
      ? await this.allowlistLoader.loadProjectAllowlist(options.projectRoot)
      : null;

    const mergedAllowlist = this.allowlistLoader.merge(globalAllowlist, projectAllowlist);

    // Merge allowlist commands with config.yml alwaysAcceptCommands
    if (mergedAllowlist.commands.length > 0) {
      validatedConfig.permissions.alwaysAcceptCommands = [
        ...new Set([
          ...validatedConfig.permissions.alwaysAcceptCommands,
          ...mergedAllowlist.commands,
        ]),
      ];
    }

    return {
      config: validatedConfig,
      allowlist: mergedAllowlist,
    };
  }

  private getDefaults(): Config {
    // Platform-specific defaults
    const isWindows = process.platform === 'win32';

    return {
      llm: {
        provider: 'deepseek',
        model: 'deepseek-chat',
        temperature: 0.7,
        maxTokens: 4096,
      },
      permissions: {
        autoAccept: false,
        acceptRiskLevel: 'medium',
        alwaysAcceptCommands: [],
      },
      keyBindings: {
        // Leader key configuration
        leader: null, // Disabled by default (use 'Ctrl+X' to enable)
        leaderTimeout: 1000, // 1 second timeout for action key
        enabled: true, // Enable all keybinds by default

        // Core shortcuts
        interrupt: ['Ctrl+C', 'Escape'],
        accept: ['Enter'],
        modeSwitch: ['Shift+Tab'],
        editCommand: ['Ctrl+E'],

        // Autocomplete/tooltips
        // Windows: Ctrl+Space is intercepted by terminal - use Tab only
        // macOS/Linux: Both work
        showTooltip: isWindows ? ['Tab'] : ['Ctrl+Space', 'Tab'],
        navigateUp: ['ArrowUp'],
        navigateDown: ['ArrowDown'],

        // Attachment navigation (Ctrl+P/N - fzf/emacs style)
        // Ctrl+D (delete), Ctrl+R (reference), Ctrl+O (open) - simple two-key combos
        navigateLeft: ['Ctrl+P'],
        navigateRight: ['Ctrl+N'],
        removeAttachment: ['Ctrl+D'],
        insertAttachmentRef: ['Ctrl+R'],
        openAttachment: ['Ctrl+O'],
        pasteFromClipboard: ['Ctrl+V'],

        // Utility
        help: [],
        clearScreen: ['Ctrl+L'],
        undo: ['Ctrl+Z'],
        redo: ['Ctrl+Y'],

        // Session management (disabled by default)
        newSession: [],
        listSessions: [],
        resumeSession: [],

        // Text editing actions (handled natively by TextInput)
        cursorToLineStart: [],
        cursorToLineEnd: [],
        cursorWordLeft: [],
        cursorWordRight: [],
        deleteWordLeft: [],
        deleteWordRight: [],
        deleteToLineEnd: [],
        deleteToLineStart: [],
        deleteEntireLine: [],
      },
      docker: {
        enabled: true,
        baseImage: 'alpine:latest',
      },
      ui: {
        theme: 'mimir',
        syntaxHighlighting: true,
        showLineNumbers: true,
        compactMode: false,
        autocompleteAutoShow: true,
        autocompleteExecuteOnSelect: true,
      },
      monitoring: {
        metricsRetentionDays: 90,
        enableHealthChecks: true,
        healthCheckIntervalSeconds: 300,
        slowOperationThresholdMs: 5000,
        batchWriteIntervalSeconds: 10,
      },
      budget: {
        enabled: false,
        warningThreshold: 0.8,
      },
      rateLimit: {
        enabled: true,
        commandsPerMinute: 60,
        toolExecutionsPerMinute: 30,
        llmCallsPerMinute: 20,
        maxFileSizeMB: 100,
      },
      agentModels: undefined, // No overrides by default
      autoSwitch: {
        enabled: false,
        promptBeforeSwitch: true,
        preferQualityOverCost: true,
        maxCostTier: 3,
      },
      paste: {
        enabled: true,
        bracketedPasteMode: true,
        textThreshold: {
          minChars: 500,
          minLines: 10,
        },
        imageSupport: true,
        maxAttachments: 10,
      },
    };
  }

  private async loadGlobalConfig(): Promise<Partial<Config> | null> {
    try {
      const configPath = path.join(os.homedir(), '.mimir', 'config.yml');
      if (!(await this.fs.exists(configPath))) {
        return null;
      }
      const content = await this.fs.readFile(configPath);
      const contentStr = typeof content === 'string' ? content : content.toString('utf-8');
      return yaml.parse(contentStr) as Partial<Config>;
    } catch (error) {
      logger.warn('Failed to load global config', { error });
      return null;
    }
  }

  private async loadProjectConfig(projectRoot: string): Promise<Partial<Config> | null> {
    try {
      const configPath = path.join(projectRoot, '.mimir', 'config.yml');
      if (!(await this.fs.exists(configPath))) {
        return null;
      }
      const content = await this.fs.readFile(configPath);
      const contentStr = typeof content === 'string' ? content : content.toString('utf-8');
      return yaml.parse(contentStr) as Partial<Config>;
    } catch (error) {
      logger.warn('Failed to load project config', { error });
      return null;
    }
  }

  private loadEnvConfig(projectRoot?: string): Partial<Config> | null {
    try {
      // Load .env from project root if provided, otherwise cwd
      const envPath = projectRoot ? path.join(projectRoot, '.env') : '.env';
      dotenv.config({ path: envPath });

      const envConfig: Record<string, unknown> = {};

      // Map environment variables to config structure
      if (
        process.env.DEEPSEEK_API_KEY ||
        process.env.ANTHROPIC_API_KEY ||
        process.env.OPENAI_API_KEY
      ) {
        const provider = process.env.LLM_PROVIDER?.toUpperCase();
        const apiKey = provider ? process.env[`${provider}_API_KEY`] : undefined;
        const baseURL = provider ? process.env[`${provider}_BASE_URL`] : undefined;

        if (apiKey || baseURL) {
          envConfig.llm = {
            ...(apiKey && { apiKey }),
            ...(baseURL && { baseURL }),
          };
        }
      }

      if (process.env.DOCKER_ENABLED) {
        envConfig.docker = {
          enabled: process.env.DOCKER_ENABLED === 'true',
        };
      }

      if (process.env.MIMIR_THEME) {
        envConfig.ui = {
          theme: process.env.MIMIR_THEME,
        };
      }

      return Object.keys(envConfig).length > 0 ? (envConfig as Partial<Config>) : null;
    } catch (error) {
      logger.warn('Failed to load .env config', { error });
      return null;
    }
  }

  private merge(base: Config, override: Partial<Config>): Config {
    return {
      llm: { ...base.llm, ...override.llm },
      agentModels: override.agentModels || base.agentModels,
      autoSwitch: { ...base.autoSwitch, ...override.autoSwitch },
      permissions: { ...base.permissions, ...override.permissions },
      keyBindings: { ...base.keyBindings, ...override.keyBindings },
      docker: { ...base.docker, ...override.docker },
      ui: { ...base.ui, ...override.ui },
      monitoring: { ...base.monitoring, ...override.monitoring },
      budget: { ...base.budget, ...override.budget },
      rateLimit: { ...base.rateLimit, ...override.rateLimit },
      paste: {
        ...base.paste,
        ...override.paste,
        textThreshold: {
          ...base.paste.textThreshold,
          ...override.paste?.textThreshold,
        },
      },
    };
  }

  async save(
    config: Partial<Config>,
    scope: 'global' | 'project',
    projectRoot?: string
  ): Promise<void> {
    const configPath =
      scope === 'global'
        ? path.join(os.homedir(), '.mimir', 'config.yml')
        : path.join(projectRoot || process.cwd(), '.mimir', 'config.yml');

    const configDir = path.dirname(configPath);

    // Ensure directory exists
    if (!(await this.fs.exists(configDir))) {
      await this.fs.mkdir(configDir, { recursive: true });
    }

    const yamlContent = yaml.stringify(config);
    await this.fs.writeFile(configPath, yamlContent);
    logger.info(`Config saved to ${configPath}`);
  }

  validate(config: unknown): Config {
    return ConfigSchema.parse(config);
  }
}
