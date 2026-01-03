/**
 * Tests for ToolRegistry
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { ToolRegistry } from '../../../src/tools/ToolRegistry.js';
import { BaseTool } from '../../../src/tools/BaseTool.js';
import type { ToolContext, ToolResult } from '../../../src/tools/types.js';

// Mock tool for testing
class MockTool extends BaseTool {
  constructor(name: string = 'mock_tool', enabled: boolean = true) {
    super({
      name,
      description: 'A mock tool for testing',
      parameters: z.object({
        input: z.string().describe('Input string'),
        optional: z.number().optional().describe('Optional number'),
      }),
      metadata: {
        source: 'built-in',
        enabled,
        tokenCost: 50,
      },
    });
  }

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    return this.success({ result: `Executed with ${args.input}` });
  }
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  describe('register', () => {
    it('should register a tool', () => {
      const tool = new MockTool();
      registry.register(tool);

      expect(registry.has('mock_tool')).toBe(true);
      expect(registry.get('mock_tool')).toBe(tool);
    });

    it('should throw error if tool already registered', () => {
      const tool1 = new MockTool();
      const tool2 = new MockTool();

      registry.register(tool1);

      expect(() => registry.register(tool2)).toThrow("Tool 'mock_tool' is already registered");
    });
  });

  describe('unregister', () => {
    it('should unregister a tool', () => {
      const tool = new MockTool();
      registry.register(tool);

      expect(registry.has('mock_tool')).toBe(true);

      const result = registry.unregister('mock_tool');
      expect(result).toBe(true);
      expect(registry.has('mock_tool')).toBe(false);
    });

    it('should return false if tool does not exist', () => {
      const result = registry.unregister('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('get', () => {
    it('should get a registered tool', () => {
      const tool = new MockTool();
      registry.register(tool);

      const retrieved = registry.get('mock_tool');
      expect(retrieved).toBe(tool);
    });

    it('should return undefined if tool does not exist', () => {
      const result = registry.get('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true if tool exists', () => {
      const tool = new MockTool();
      registry.register(tool);

      expect(registry.has('mock_tool')).toBe(true);
    });

    it('should return false if tool does not exist', () => {
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('list', () => {
    it('should list all registered tools', () => {
      const tool1 = new MockTool('tool1');
      const tool2 = new MockTool('tool2');
      const tool3 = new MockTool('tool3');

      registry.register(tool1);
      registry.register(tool2);
      registry.register(tool3);

      const tools = registry.list();
      expect(tools).toHaveLength(3);
      expect(tools).toContain(tool1);
      expect(tools).toContain(tool2);
      expect(tools).toContain(tool3);
    });

    it('should return empty array if no tools registered', () => {
      const tools = registry.list();
      expect(tools).toEqual([]);
    });
  });

  describe('listEnabled', () => {
    it('should list only enabled tools', () => {
      const tool1 = new MockTool('tool1', true);
      const tool2 = new MockTool('tool2', false);
      const tool3 = new MockTool('tool3', true);

      registry.register(tool1);
      registry.register(tool2);
      registry.register(tool3);

      const enabled = registry.listEnabled();
      expect(enabled).toHaveLength(2);
      expect(enabled).toContain(tool1);
      expect(enabled).toContain(tool3);
      expect(enabled).not.toContain(tool2);
    });
  });

  describe('getSchemas', () => {
    it('should get schemas for all enabled tools', () => {
      const tool1 = new MockTool('tool1', true);
      const tool2 = new MockTool('tool2', false);
      const tool3 = new MockTool('tool3', true);

      registry.register(tool1);
      registry.register(tool2);
      registry.register(tool3);

      const schemas = registry.getSchemas();
      expect(schemas).toHaveLength(2);
      expect(schemas[0]!.name).toBe('tool1');
      expect(schemas[1]!.name).toBe('tool3');
    });

    it('should get schemas for specific tools', () => {
      const tool1 = new MockTool('tool1', true);
      const tool2 = new MockTool('tool2', true);
      const tool3 = new MockTool('tool3', true);

      registry.register(tool1);
      registry.register(tool2);
      registry.register(tool3);

      const schemas = registry.getSchemas(['tool1', 'tool3']);
      expect(schemas).toHaveLength(2);
      expect(schemas[0]!.name).toBe('tool1');
      expect(schemas[1]!.name).toBe('tool3');
    });
  });

  describe('execute', () => {
    it('should execute a tool successfully', async () => {
      const tool = new MockTool();
      registry.register(tool);

      const result = await registry.execute('mock_tool', { input: 'test' }, {});

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ result: 'Executed with test' });
      expect(result.metadata?.executionTime).toBeDefined();
      expect(typeof result.metadata?.executionTime).toBe('number');
    });

    it('should return error if tool not found', async () => {
      const result = await registry.execute('nonexistent', {}, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe("Tool 'nonexistent' not found");
    });

    it('should return error if tool is disabled', async () => {
      const tool = new MockTool('disabled_tool', false);
      registry.register(tool);

      const result = await registry.execute('disabled_tool', {}, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe("Tool 'disabled_tool' is disabled");
    });

    it('should return error if validation fails', async () => {
      const tool = new MockTool();
      registry.register(tool);

      const result = await registry.execute('mock_tool', { invalid: 'arg' }, {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
    });

    it('should handle tool execution errors', async () => {
      class ErrorTool extends BaseTool {
        constructor() {
          super({
            name: 'error_tool',
            description: 'Tool that throws error',
            parameters: z.object({}),
            metadata: { source: 'built-in', enabled: true, tokenCost: 0 },
          });
        }

        async execute(): Promise<ToolResult> {
          throw new Error('Execution failed');
        }
      }

      const tool = new ErrorTool();
      registry.register(tool);

      const result = await registry.execute('error_tool', {}, {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Execution failed');
    });
  });

  describe('getTotalTokenCost', () => {
    it('should calculate total token cost for all enabled tools', () => {
      class Tool1 extends MockTool {
        constructor() {
          super('tool1', true);
          this.definition.metadata.tokenCost = 50;
        }
      }

      class Tool2 extends MockTool {
        constructor() {
          super('tool2', true);
          this.definition.metadata.tokenCost = 75;
        }
      }

      class Tool3 extends MockTool {
        constructor() {
          super('tool3', false);
          this.definition.metadata.tokenCost = 100;
        }
      }

      registry.register(new Tool1());
      registry.register(new Tool2());
      registry.register(new Tool3());

      const total = registry.getTotalTokenCost();
      expect(total).toBe(125); // Only tool1 and tool2
    });

    it('should calculate total token cost for specific tools', () => {
      class Tool1 extends MockTool {
        constructor() {
          super('tool1', true);
          this.definition.metadata.tokenCost = 50;
        }
      }

      class Tool2 extends MockTool {
        constructor() {
          super('tool2', true);
          this.definition.metadata.tokenCost = 75;
        }
      }

      registry.register(new Tool1());
      registry.register(new Tool2());

      const total = registry.getTotalTokenCost(['tool1']);
      expect(total).toBe(50);
    });
  });

  describe('clear', () => {
    it('should remove all tools', () => {
      registry.register(new MockTool('tool1'));
      registry.register(new MockTool('tool2'));
      registry.register(new MockTool('tool3'));

      expect(registry.list()).toHaveLength(3);

      registry.clear();

      expect(registry.list()).toHaveLength(0);
      expect(registry.has('tool1')).toBe(false);
      expect(registry.has('tool2')).toBe(false);
      expect(registry.has('tool3')).toBe(false);
    });
  });
});
