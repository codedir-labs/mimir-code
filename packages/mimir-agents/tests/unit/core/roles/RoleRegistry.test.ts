/**
 * RoleRegistry tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RoleRegistry } from '../../../../src/core/roles/RoleRegistry.js';
import type {
  AgentRole,
  RoleConfig,
  EnforcementRule,
  LoopPattern,
} from '../../../../src/core/roles/types.js';

describe('RoleRegistry', () => {
  let registry: RoleRegistry;

  beforeEach(() => {
    registry = new RoleRegistry();
  });

  describe('standard roles', () => {
    it('should have 9 standard roles registered', () => {
      const roles = registry.list();
      expect(roles).toHaveLength(9); // 8 specialized + general
    });

    it('should have finder role', () => {
      const role = registry.get('finder');
      expect(role).toBeDefined();
      expect(role?.role).toBe('finder');
      expect(role?.recommendedModel).toBe('claude-haiku-4.5');
      expect(role?.toolAccessLevel).toBe('read-only');
      expect(role?.defaultBudget?.maxIterations).toBe(5);
    });

    it('should have thinker role', () => {
      const role = registry.get('thinker');
      expect(role).toBeDefined();
      expect(role?.role).toBe('thinker');
      expect(role?.recommendedModel).toBe('claude-opus-4.5');
      expect(role?.toolAccessLevel).toBe('all');
      expect(role?.defaultBudget?.maxIterations).toBe(20);
    });

    it('should have librarian role', () => {
      const role = registry.get('librarian');
      expect(role).toBeDefined();
      expect(role?.role).toBe('librarian');
      expect(role?.allowedTools).toContain('web_search');
    });

    it('should have refactoring role', () => {
      const role = registry.get('refactoring');
      expect(role).toBeDefined();
      expect(role?.forbiddenTools).toContain('bash');
    });

    it('should have reviewer role', () => {
      const role = registry.get('reviewer');
      expect(role).toBeDefined();
      expect(role?.toolAccessLevel).toBe('read-git');
    });

    it('should have tester role', () => {
      const role = registry.get('tester');
      expect(role).toBeDefined();
      expect(role?.toolAccessLevel).toBe('read-write-bash');
    });

    it('should have security role', () => {
      const role = registry.get('security');
      expect(role).toBeDefined();
      expect(role?.description).toContain('security');
    });

    it('should have rush role', () => {
      const role = registry.get('rush');
      expect(role).toBeDefined();
      expect(role?.defaultBudget?.maxIterations).toBe(3);
    });
  });

  describe('register and get', () => {
    it('should register a custom role', () => {
      const customRole: RoleConfig = {
        role: 'general',
        description: 'Custom role',
        recommendedModel: 'claude-sonnet-4.5',
        toolAccessLevel: 'all',
      };

      registry.register(customRole);
      const retrieved = registry.get('general');
      expect(retrieved).toEqual(customRole);
    });

    it('should return undefined for non-existent role', () => {
      const result = registry.get('nonexistent' as AgentRole);
      expect(result).toBeUndefined();
    });

    it('should throw when getting non-existent role with getOrThrow', () => {
      expect(() => registry.getOrThrow('nonexistent' as AgentRole)).toThrow('Role not found');
    });
  });

  describe('has and getRoles', () => {
    it('should check if role exists', () => {
      expect(registry.has('finder')).toBe(true);
      expect(registry.has('nonexistent' as AgentRole)).toBe(false);
    });

    it('should return all role names', () => {
      const roles = registry.getRoles();
      expect(roles).toContain('finder');
      expect(roles).toContain('thinker');
      expect(roles).toContain('general');
      expect(roles).toHaveLength(9);
    });
  });

  describe('enforcement rules', () => {
    it('should add enforcement rule', () => {
      const rule: EnforcementRule = {
        trigger: 'code_modification',
        role: 'security',
        when: 'after',
      };

      registry.addEnforcementRule(rule);
      const rules = registry.getAllEnforcementRules();
      expect(rules).toContain(rule);
    });

    it('should get enforcement rules by trigger', () => {
      registry.addEnforcementRule({
        trigger: 'code_modification',
        role: 'security',
        when: 'after',
      });

      registry.addEnforcementRule({
        trigger: 'test_execution',
        role: 'reviewer',
        when: 'after',
      });

      const rules = registry.getEnforcementRules('code_modification');
      expect(rules).toHaveLength(1);
      expect(rules[0]?.role).toBe('security');
    });

    it('should return always-trigger rules for any trigger', () => {
      registry.addEnforcementRule({
        trigger: 'always',
        role: 'security',
        when: 'after',
      });

      const codeRules = registry.getEnforcementRules('code_modification');
      const testRules = registry.getEnforcementRules('test_execution');

      expect(codeRules).toHaveLength(1);
      expect(testRules).toHaveLength(1);
    });

    it('should check if role is enforced', () => {
      registry.addEnforcementRule({
        trigger: 'code_modification',
        role: 'security',
        when: 'after',
      });

      expect(registry.isEnforced('security', 'code_modification')).toBe(true);
      expect(registry.isEnforced('reviewer', 'code_modification')).toBe(false);
    });
  });

  describe('loop patterns', () => {
    it('should start with no loop patterns (patterns registered in defaultRoleRegistry)', () => {
      const patterns = registry.getAllLoopPatterns();
      expect(patterns).toHaveLength(0); // New instance has no patterns
    });

    it('should register custom loop pattern', () => {
      const pattern: LoopPattern = {
        pattern: ['finder', 'thinker'],
        maxIterations: 3,
        breakCondition: () => true,
        description: 'Custom pattern',
      };

      registry.registerLoopPattern('custom', pattern);
      const retrieved = registry.getLoopPattern('custom');
      expect(retrieved).toEqual(pattern);
    });

    it('should match loop pattern sequence', () => {
      // Register the pattern first
      registry.registerLoopPattern('test-pattern', {
        pattern: ['refactoring', 'tester', 'reviewer'],
        maxIterations: 5,
        breakCondition: () => false,
      });

      const sequence: AgentRole[] = ['refactoring', 'tester', 'reviewer'];
      const matched = registry.matchesLoopPattern(sequence);

      expect(matched).toBeDefined();
      expect(matched?.pattern).toEqual(sequence);
    });

    it('should return null for non-matching sequence', () => {
      const sequence: AgentRole[] = ['finder', 'librarian'];
      const matched = registry.matchesLoopPattern(sequence);

      expect(matched).toBeNull();
    });
  });

  describe('tool access level descriptions', () => {
    it('should provide description for read-only', () => {
      const desc = RoleRegistry.getToolAccessDescription('read-only');
      expect(desc).toContain('Read');
      expect(desc).toContain('no modifications');
    });

    it('should provide description for all access levels', () => {
      const levels = ['read-only', 'read-write', 'read-git', 'read-write-bash', 'all'] as const;

      for (const level of levels) {
        const desc = RoleRegistry.getToolAccessDescription(level);
        expect(desc).toBeTruthy();
        expect(typeof desc).toBe('string');
      }
    });
  });

  describe('export', () => {
    it('should export full configuration', () => {
      registry.addEnforcementRule({
        trigger: 'code_modification',
        role: 'security',
        when: 'after',
      });

      const exported = registry.export();

      expect(exported.roles).toHaveLength(9); // 8 specialized + general
      expect(exported.enforcementRules).toHaveLength(1);
      expect(exported.loopPatterns).toHaveLength(0); // New instance has no patterns
    });

    it('should include loop pattern names in export', () => {
      // Register patterns first
      registry.registerLoopPattern('refactor-test-review', {
        pattern: ['refactoring', 'tester', 'reviewer'],
        maxIterations: 5,
        breakCondition: () => false,
      });

      const exported = registry.export();

      const patternNames = exported.loopPatterns.map((p) => p.name);
      expect(patternNames).toContain('refactor-test-review');
    });
  });
});
