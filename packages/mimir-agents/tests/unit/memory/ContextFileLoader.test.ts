/**
 * Tests for ContextFileLoader
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextFileLoader } from '../../../src/memory/ContextFileLoader.js';
import { MockFileSystem } from '../../mocks/MockFileSystem.js';

describe('ContextFileLoader', () => {
  let fs: MockFileSystem;
  let loader: ContextFileLoader;
  const homeDir = '/home/user';
  const projectRoot = '/project';

  beforeEach(() => {
    fs = new MockFileSystem();
    loader = new ContextFileLoader(fs, homeDir, projectRoot);
  });

  describe('loadContext', () => {
    it('should load context from default locations', async () => {
      await fs.writeFile(`${homeDir}/.mimir/MIMIR.md`, '# Global context');
      await fs.writeFile(`${projectRoot}/MIMIR.md`, '# Project context');

      const result = await loader.loadContext();

      expect(result.content).toContain('Global context');
      expect(result.content).toContain('Project context');
      expect(result.loadedFiles).toHaveLength(2);
      expect(result.warnings).toHaveLength(0);
    });

    it('should load local override files', async () => {
      await fs.writeFile(`${projectRoot}/MIMIR.md`, '# Base config');
      await fs.writeFile(`${projectRoot}/MIMIR.local.md`, '# Local override');

      const result = await loader.loadContext();

      expect(result.content).toContain('Base config');
      expect(result.content).toContain('Local override');
      expect(result.loadedFiles).toHaveLength(2);
    });

    it('should skip .local.md files when loadLocal is false', async () => {
      await fs.writeFile(`${projectRoot}/MIMIR.md`, '# Base config');
      await fs.writeFile(`${projectRoot}/MIMIR.local.md`, '# Local override');

      const result = await loader.loadContext({ loadLocal: false });

      expect(result.content).toContain('Base config');
      expect(result.content).not.toContain('Local override');
      expect(result.loadedFiles).toHaveLength(1);
    });

    it('should use custom base name', async () => {
      await fs.writeFile(`${projectRoot}/AGENTS.md`, '# Agents config');

      const result = await loader.loadContext({ baseName: 'AGENTS' });

      expect(result.content).toContain('Agents config');
      expect(result.loadedFiles[0]).toContain('AGENTS.md');
    });

    it('should search in all default locations', async () => {
      await fs.writeFile(`${homeDir}/.mimir/MIMIR.md`, '# Home global');
      await fs.writeFile(`${homeDir}/.mimir/MIMIR.local.md`, '# Home local');
      await fs.writeFile(`${projectRoot}/MIMIR.md`, '# Project root');
      await fs.writeFile(`${projectRoot}/MIMIR.local.md`, '# Project root local');
      await fs.writeFile(`${projectRoot}/.mimir/MIMIR.md`, '# Project .mimir');
      await fs.writeFile(`${projectRoot}/.mimir/MIMIR.local.md`, '# Project .mimir local');

      const result = await loader.loadContext();

      expect(result.loadedFiles).toHaveLength(6);
      expect(result.content).toContain('Home global');
      expect(result.content).toContain('Home local');
      expect(result.content).toContain('Project root');
      expect(result.content).toContain('Project root local');
      expect(result.content).toContain('Project .mimir');
      expect(result.content).toContain('Project .mimir local');
    });

    it('should include additional paths', async () => {
      await fs.writeFile('/custom/path/config.md', '# Custom config');

      const result = await loader.loadContext({
        additionalPaths: ['/custom/path/config.md'],
      });

      expect(result.content).toContain('Custom config');
      expect(result.loadedFiles).toContain('/custom/path/config.md');
    });

    it('should handle non-existent files gracefully', async () => {
      const result = await loader.loadContext();

      expect(result.content).toBe('');
      expect(result.loadedFiles).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should add source tracking comments', async () => {
      await fs.writeFile(`${homeDir}/.mimir/MIMIR.md`, '# Home config');
      await fs.writeFile(`${projectRoot}/MIMIR.md`, '# Project config');

      const result = await loader.loadContext();

      expect(result.content).toContain('<!-- Source:');
      expect(result.content).toContain(`${homeDir}/.mimir/MIMIR.md`);
      expect(result.content).toContain(`${projectRoot}/MIMIR.md`);
    });

    it('should handle read errors and add warnings', async () => {
      // First write the file using normal fs
      await fs.writeFile(`${homeDir}/.mimir/error.md`, 'content');

      // Create a file system that will fail to read
      const errorFS = {
        ...fs,
        readFile: async (path: string) => {
          if (path.includes('error')) {
            throw new Error('Read error');
          }
          return fs.readFile(path);
        },
        exists: async (path: string) => {
          if (path.includes('error')) {
            return true;
          }
          return fs.exists(path);
        },
        join: fs.join.bind(fs),
      };

      const errorLoader = new ContextFileLoader(errorFS as any, homeDir, projectRoot);

      const result = await errorLoader.loadContext({
        additionalPaths: [`${homeDir}/.mimir/error.md`],
      });

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Failed to load');
    });

    it('should merge multiple files in correct order', async () => {
      await fs.writeFile(`${homeDir}/.mimir/MIMIR.md`, '# First');
      await fs.writeFile(`${projectRoot}/MIMIR.md`, '# Second');
      await fs.writeFile(`${projectRoot}/.mimir/MIMIR.md`, '# Third');

      const result = await loader.loadContext();

      const firstIndex = result.content.indexOf('# First');
      const secondIndex = result.content.indexOf('# Second');
      const thirdIndex = result.content.indexOf('# Third');

      expect(firstIndex).toBeLessThan(secondIndex);
      expect(secondIndex).toBeLessThan(thirdIndex);
    });

    it('should handle empty files', async () => {
      await fs.writeFile(`${projectRoot}/MIMIR.md`, '');

      const result = await loader.loadContext();

      expect(result.loadedFiles).toHaveLength(1);
      expect(result.content).toContain(`<!-- Source: ${projectRoot}/MIMIR.md -->`);
    });

    it('should handle Buffer content', async () => {
      await fs.writeFile(`${projectRoot}/MIMIR.md`, Buffer.from('# Buffer content'));

      const result = await loader.loadContext();

      expect(result.content).toContain('Buffer content');
    });
  });

  describe('hasContextFiles', () => {
    it('should return true when files exist', async () => {
      await fs.writeFile(`${projectRoot}/MIMIR.md`, '# Config');

      const result = await loader.hasContextFiles();

      expect(result).toBe(true);
    });

    it('should return false when no files exist', async () => {
      const result = await loader.hasContextFiles();

      expect(result).toBe(false);
    });

    it('should check for local files when enabled', async () => {
      await fs.writeFile(`${projectRoot}/MIMIR.local.md`, '# Local config');

      const result = await loader.hasContextFiles({ loadLocal: true });

      expect(result).toBe(true);
    });

    it('should not check local files when disabled', async () => {
      await fs.writeFile(`${projectRoot}/MIMIR.local.md`, '# Local config');

      const resultWithLocal = await loader.hasContextFiles({ loadLocal: true });
      const resultWithoutLocal = await loader.hasContextFiles({ loadLocal: false });

      expect(resultWithLocal).toBe(true);
      expect(resultWithoutLocal).toBe(false);
    });

    it('should check custom base name', async () => {
      await fs.writeFile(`${projectRoot}/AGENTS.md`, '# Agents');

      const result = await loader.hasContextFiles({ baseName: 'AGENTS' });

      expect(result).toBe(true);
    });

    it('should check all default locations', async () => {
      await fs.writeFile(`${homeDir}/.mimir/MIMIR.md`, '# Config');

      const result = await loader.hasContextFiles();

      expect(result).toBe(true);
    });

    it('should handle errors silently', async () => {
      const errorFS = {
        ...fs,
        exists: async () => {
          throw new Error('Check error');
        },
        join: fs.join.bind(fs),
      };

      const errorLoader = new ContextFileLoader(errorFS as any, homeDir, projectRoot);

      const result = await errorLoader.hasContextFiles();

      expect(result).toBe(false);
    });
  });

  describe('getExpectedPaths', () => {
    it('should return all expected paths for default base name', () => {
      const paths = loader.getExpectedPaths();

      expect(paths).toContain(`${homeDir}/.mimir/MIMIR.md`);
      expect(paths).toContain(`${homeDir}/.mimir/MIMIR.local.md`);
      expect(paths).toContain(`${projectRoot}/MIMIR.md`);
      expect(paths).toContain(`${projectRoot}/MIMIR.local.md`);
      expect(paths).toContain(`${projectRoot}/.mimir/MIMIR.md`);
      expect(paths).toContain(`${projectRoot}/.mimir/MIMIR.local.md`);
      expect(paths).toHaveLength(6);
    });

    it('should return paths for custom base name', () => {
      const paths = loader.getExpectedPaths('AGENTS');

      expect(paths).toContain(`${homeDir}/.mimir/AGENTS.md`);
      expect(paths).toContain(`${projectRoot}/AGENTS.md`);
      expect(paths).toContain(`${projectRoot}/.mimir/AGENTS.md`);
    });

    it('should return paths in correct order', () => {
      const paths = loader.getExpectedPaths();

      expect(paths[0]).toBe(`${homeDir}/.mimir/MIMIR.md`);
      expect(paths[1]).toBe(`${homeDir}/.mimir/MIMIR.local.md`);
      expect(paths[2]).toBe(`${projectRoot}/MIMIR.md`);
      expect(paths[3]).toBe(`${projectRoot}/MIMIR.local.md`);
      expect(paths[4]).toBe(`${projectRoot}/.mimir/MIMIR.md`);
      expect(paths[5]).toBe(`${projectRoot}/.mimir/MIMIR.local.md`);
    });
  });

  describe('integration scenarios', () => {
    it('should support multi-project setup with shared global config', async () => {
      // Global config
      await fs.writeFile(
        `${homeDir}/.mimir/MIMIR.md`,
        '# Global rules\n- Use TypeScript\n- Follow style guide'
      );

      // Project-specific config
      await fs.writeFile(
        `${projectRoot}/MIMIR.md`,
        '# Project rules\n- Use React\n- Test with Vitest'
      );

      // Local overrides (not in git)
      await fs.writeFile(`${projectRoot}/MIMIR.local.md`, '# Local dev\n- Debug mode enabled');

      const result = await loader.loadContext();

      expect(result.content).toContain('Global rules');
      expect(result.content).toContain('Project rules');
      expect(result.content).toContain('Local dev');
      expect(result.loadedFiles).toHaveLength(3);
    });

    it('should support different context files for different purposes', async () => {
      await fs.writeFile(`${projectRoot}/MIMIR.md`, '# Main config');
      await fs.writeFile(`${projectRoot}/AGENTS.md`, '# Agent-specific config');

      const mimirResult = await loader.loadContext({ baseName: 'MIMIR' });
      const agentsResult = await loader.loadContext({ baseName: 'AGENTS' });

      expect(mimirResult.content).toContain('Main config');
      expect(mimirResult.content).not.toContain('Agent-specific');

      expect(agentsResult.content).toContain('Agent-specific');
      expect(agentsResult.content).not.toContain('Main config');
    });

    it('should handle team context with local overrides', async () => {
      // Team-shared config (in git)
      await fs.writeFile(
        `${projectRoot}/.mimir/MIMIR.md`,
        '# Team standards\n- Code review required'
      );

      // Personal local config (not in git)
      await fs.writeFile(`${projectRoot}/.mimir/MIMIR.local.md`, '# Personal\n- Custom aliases');

      const result = await loader.loadContext();

      expect(result.content).toContain('Team standards');
      expect(result.content).toContain('Personal');
    });

    it('should work with no config files (graceful degradation)', async () => {
      const result = await loader.loadContext();
      const hasFiles = await loader.hasContextFiles();

      expect(result.content).toBe('');
      expect(result.loadedFiles).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(hasFiles).toBe(false);
    });
  });
});
