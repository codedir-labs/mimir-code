/**
 * Unit tests for AllowlistLoader
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AllowlistLoader, AllowlistSchema } from '../../../src/config/AllowlistLoader.js';
import { IFileSystem } from '../../../src/platform/IFileSystem.js';
import path from 'path';

// Mock filesystem
const createMockFs = (): IFileSystem => {
  const files = new Map<string, string>();

  return {
    exists: vi.fn(async (path: string) => files.has(path)),
    readFile: vi.fn(async (path: string) => {
      if (!files.has(path)) throw new Error(`File not found: ${path}`);
      return files.get(path)!;
    }),
    writeFile: vi.fn(async (path: string, content: string) => {
      files.set(path, content);
    }),
    mkdir: vi.fn(async () => {}),
    setFile: (path: string, content: string) => files.set(path, content),
  } as any;
};

describe('AllowlistLoader', () => {
  let fs: IFileSystem;
  let loader: AllowlistLoader;

  beforeEach(() => {
    fs = createMockFs();
    loader = new AllowlistLoader(fs);
  });

  describe('loadProjectAllowlist', () => {
    it('should load valid project allowlist', async () => {
      const allowlistYaml = `
commands:
  - '/test'
  - '/lint'
files:
  - '**/*.ts'
urls:
  - 'https://api.example.com/**'
envVars:
  - 'API_KEY'
bashCommands:
  - 'yarn test'
`;

      (fs as any).setFile(path.join('/project', '.mimir', 'allowlist.yml'), allowlistYaml);

      const allowlist = await loader.loadProjectAllowlist('/project');

      expect(allowlist).toEqual({
        commands: ['/test', '/lint'],
        files: ['**/*.ts'],
        urls: ['https://api.example.com/**'],
        envVars: ['API_KEY'],
        bashCommands: ['yarn test'],
      });
    });

    it('should return null if file does not exist', async () => {
      const allowlist = await loader.loadProjectAllowlist('/project');
      expect(allowlist).toBeNull();
    });

    it('should handle missing optional fields', async () => {
      const allowlistYaml = `
commands:
  - '/test'
`;
      (fs as any).setFile(path.join('/project', '.mimir', 'allowlist.yml'), allowlistYaml);

      const allowlist = await loader.loadProjectAllowlist('/project');

      expect(allowlist).toEqual({
        commands: ['/test'],
        files: [],
        urls: [],
        envVars: [],
        bashCommands: [],
      });
    });

    it('should return null on invalid YAML', async () => {
      (fs as any).setFile(path.join('/project', '.mimir', 'allowlist.yml'), 'invalid: yaml: :');

      const allowlist = await loader.loadProjectAllowlist('/project');
      expect(allowlist).toBeNull();
    });
  });

  describe('loadGlobalAllowlist', () => {
    it('should load global allowlist from home directory', async () => {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '~';
      const allowlistYaml = `
commands:
  - '/status'
  - '/help'
`;
      (fs as any).setFile(path.join(homeDir, '.mimir', 'allowlist.yml'), allowlistYaml);

      const allowlist = await loader.loadGlobalAllowlist();

      expect(allowlist).toEqual({
        commands: ['/status', '/help'],
        files: [],
        urls: [],
        envVars: [],
        bashCommands: [],
      });
    });
  });

  describe('merge', () => {
    it('should merge global and project allowlists', () => {
      const global = {
        commands: ['/status', '/help'],
        files: ['**/*.md'],
        urls: [],
        envVars: [],
        bashCommands: ['git status'],
      };

      const project = {
        commands: ['/test', '/lint'],
        files: ['**/*.ts'],
        urls: ['https://api.example.com/**'],
        envVars: ['API_KEY'],
        bashCommands: ['yarn test'],
      };

      const merged = loader.merge(global, project);

      expect(merged.commands).toEqual(['/status', '/help', '/test', '/lint']);
      expect(merged.files).toEqual(['**/*.md', '**/*.ts']);
      expect(merged.bashCommands).toEqual(['git status', 'yarn test']);
    });

    it('should deduplicate entries', () => {
      const global = {
        commands: ['/test', '/status'],
        files: [],
        urls: [],
        envVars: [],
        bashCommands: [],
      };

      const project = {
        commands: ['/test', '/lint'],
        files: [],
        urls: [],
        envVars: [],
        bashCommands: [],
      };

      const merged = loader.merge(global, project);

      expect(merged.commands).toEqual(['/test', '/status', '/lint']);
    });

    it('should handle null global', () => {
      const project = {
        commands: ['/test'],
        files: [],
        urls: [],
        envVars: [],
        bashCommands: [],
      };

      const merged = loader.merge(null, project);

      expect(merged.commands).toEqual(['/test']);
    });

    it('should handle null project', () => {
      const global = {
        commands: ['/status'],
        files: [],
        urls: [],
        envVars: [],
        bashCommands: [],
      };

      const merged = loader.merge(global, null);

      expect(merged.commands).toEqual(['/status']);
    });
  });

  describe('AllowlistSchema', () => {
    it('should validate correct allowlist', () => {
      const valid = {
        commands: ['/test'],
        files: ['**/*.ts'],
        urls: ['https://example.com'],
        envVars: ['API_KEY'],
        bashCommands: ['yarn test'],
      };

      expect(() => AllowlistSchema.parse(valid)).not.toThrow();
    });

    it('should use defaults for missing fields', () => {
      const parsed = AllowlistSchema.parse({});

      expect(parsed).toEqual({
        commands: [],
        files: [],
        urls: [],
        envVars: [],
        bashCommands: [],
      });
    });

    it('should reject invalid types', () => {
      const invalid = {
        commands: 'not-an-array',
      };

      expect(() => AllowlistSchema.parse(invalid)).toThrow();
    });
  });

  describe('createExample', () => {
    it('should create example project allowlist', async () => {
      await loader.createExample('/project/.mimir/allowlist.yml', 'project');

      expect(fs.writeFile).toHaveBeenCalled();
      const call = vi.mocked(fs.writeFile).mock.calls[0];
      expect(call[0]).toBe('/project/.mimir/allowlist.yml');
      expect(call[1]).toContain('Project Allowlist');
      expect(call[1]).toContain('commands:');
    });

    it('should create example global allowlist', async () => {
      await loader.createExample('/.mimir/allowlist.yml', 'global');

      expect(fs.writeFile).toHaveBeenCalled();
      const call = vi.mocked(fs.writeFile).mock.calls[0];
      expect(call[1]).toContain('Global Allowlist');
    });

    it('should create parent directory if needed', async () => {
      await loader.createExample('/new/.mimir/allowlist.yml', 'project');

      expect(fs.mkdir).toHaveBeenCalledWith('/new/.mimir', { recursive: true });
    });
  });
});
