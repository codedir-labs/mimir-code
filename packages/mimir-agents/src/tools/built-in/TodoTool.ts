/**
 * TodoTool - Manage todo lists for task tracking
 */

import { z } from 'zod';
import { BaseTool } from '../BaseTool.js';
import type { ToolContext, ToolResult } from '../types.js';

/**
 * Todo item
 */
export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

/**
 * Todo storage interface
 */
export interface ITodoStorage {
  getTodos(conversationId: string): Promise<TodoItem[]>;
  setTodos(conversationId: string, todos: TodoItem[]): Promise<void>;
}

/**
 * Todo management tool
 */
export class TodoTool extends BaseTool {
  constructor(private storage: ITodoStorage) {
    super({
      name: 'todo',
      description:
        'Manage todo lists for tracking task progress. Use this frequently to show progress to the user.',
      parameters: z.object({
        action: z.enum(['read', 'write', 'update']).describe('Action to perform'),
        todos: z
          .array(
            z.object({
              content: z.string().describe('Task description'),
              status: z.enum(['pending', 'in_progress', 'completed']).describe('Task status'),
              activeForm: z.string().describe('Present continuous form (e.g., "Running tests")'),
            })
          )
          .optional()
          .describe('Todo items (required for write/update)'),
      }),
      metadata: {
        source: 'built-in',
        enabled: true,
        tokenCost: 60,
      },
    });
  }

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const { action, todos } = args as {
      action: 'read' | 'write' | 'update';
      todos?: TodoItem[];
    };

    const conversationId = context.conversationId || 'default';

    try {
      switch (action) {
        case 'read': {
          const currentTodos = await this.storage.getTodos(conversationId);
          return this.success(currentTodos, {
            count: currentTodos.length,
            pending: currentTodos.filter((t) => t.status === 'pending').length,
            inProgress: currentTodos.filter((t) => t.status === 'in_progress').length,
            completed: currentTodos.filter((t) => t.status === 'completed').length,
          });
        }

        case 'write':
        case 'update': {
          if (!todos || !Array.isArray(todos)) {
            return this.error('Todos array is required for write/update action');
          }

          await this.storage.setTodos(conversationId, todos);

          return this.success(
            { message: 'Todos updated successfully', todos },
            {
              count: todos.length,
              pending: todos.filter((t) => t.status === 'pending').length,
              inProgress: todos.filter((t) => t.status === 'in_progress').length,
              completed: todos.filter((t) => t.status === 'completed').length,
            }
          );
        }

        default:
          return this.error(`Unknown action: ${action}`);
      }
    } catch (error) {
      return this.error(error instanceof Error ? error.message : 'Failed to manage todos');
    }
  }
}
