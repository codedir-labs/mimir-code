/**
 * Unit tests for ConfigLoader
 */

import { describe, it, expect } from 'vitest';
import { ConfigLoader } from '@/shared/config/ConfigLoader.js';
import { ConfigSchema } from '@/shared/config/schemas.js';
import { FileSystemAdapter } from '@codedir/mimir-agents-node/platform';

describe('ConfigLoader', () => {
  it('should load default configuration', async () => {
    const fs = new FileSystemAdapter();
    const loader = new ConfigLoader(fs);
    const { config, allowlist } = await loader.load();

    expect(config).toBeDefined();
    expect(config.llm.provider).toBe('deepseek');
    expect(config.permissions.autoAccept).toBe(false);
    expect(allowlist).toBeDefined();
    expect(allowlist.commands).toEqual([]);
  });

  it('should validate configuration with Zod schema', () => {
    const validConfig = {
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
        interrupt: 'ctrl+C',
        modeSwitch: 'shift+Tab',
        editCommand: 'ctrl+E',
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
      tools: {},
      mcp: {
        servers: [],
      },
    };

    expect(() => ConfigSchema.parse(validConfig)).not.toThrow();
  });

  it('should reject invalid configuration', () => {
    const invalidConfig = {
      llm: {
        provider: 'invalid-provider',
        model: 'test',
      },
    };

    expect(() => ConfigSchema.parse(invalidConfig)).toThrow();
  });
});
