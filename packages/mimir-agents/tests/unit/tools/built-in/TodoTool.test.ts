/**
 * Tests for TodoTool
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TodoTool,
  type TodoItem,
  type ITodoStorage,
} from '../../../../src/tools/built-in/TodoTool.js';

// Mock todo storage
class MockTodoStorage implements ITodoStorage {
  private todos: Map<string, TodoItem[]> = new Map();

  async getTodos(conversationId: string): Promise<TodoItem[]> {
    return this.todos.get(conversationId) || [];
  }

  async setTodos(conversationId: string, todos: TodoItem[]): Promise<void> {
    this.todos.set(conversationId, todos);
  }
}

describe('TodoTool', () => {
  let storage: MockTodoStorage;
  let tool: TodoTool;

  beforeEach(() => {
    storage = new MockTodoStorage();
    tool = new TodoTool(storage);
  });

  describe('definition', () => {
    it('should have correct name', () => {
      expect(tool.definition.name).toBe('todo');
    });

    it('should be enabled by default', () => {
      expect(tool.definition.metadata.enabled).toBe(true);
    });

    it('should have token cost', () => {
      expect(tool.definition.metadata.tokenCost).toBe(60);
    });
  });

  describe('execute', () => {
    it('should read empty todo list', async () => {
      const result = await tool.execute({ action: 'read' }, { conversationId: 'conv1' });

      expect(result.success).toBe(true);
      expect(result.output).toEqual([]);
      expect(result.metadata?.count).toBe(0);
    });

    it('should write todos', async () => {
      const todos: TodoItem[] = [
        { content: 'Task 1', status: 'pending', activeForm: 'Doing task 1' },
        { content: 'Task 2', status: 'in_progress', activeForm: 'Doing task 2' },
      ];

      const result = await tool.execute({ action: 'write', todos }, { conversationId: 'conv1' });

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(2);
      expect(result.metadata?.pending).toBe(1);
      expect(result.metadata?.inProgress).toBe(1);
    });

    it('should read written todos', async () => {
      const todos: TodoItem[] = [
        { content: 'Task 1', status: 'completed', activeForm: 'Doing task 1' },
      ];

      await tool.execute({ action: 'write', todos }, { conversationId: 'conv1' });

      const result = await tool.execute({ action: 'read' }, { conversationId: 'conv1' });

      expect(result.success).toBe(true);
      expect(result.output).toEqual(todos);
      expect(result.metadata?.completed).toBe(1);
    });

    it('should update todos', async () => {
      const todos1: TodoItem[] = [
        { content: 'Task 1', status: 'pending', activeForm: 'Doing task 1' },
      ];

      await tool.execute({ action: 'write', todos: todos1 }, { conversationId: 'conv1' });

      const todos2: TodoItem[] = [
        { content: 'Task 1', status: 'completed', activeForm: 'Doing task 1' },
        { content: 'Task 2', status: 'pending', activeForm: 'Doing task 2' },
      ];

      const result = await tool.execute(
        { action: 'update', todos: todos2 },
        { conversationId: 'conv1' }
      );

      expect(result.success).toBe(true);
      expect(result.metadata?.count).toBe(2);

      const readResult = await tool.execute({ action: 'read' }, { conversationId: 'conv1' });

      expect(readResult.output).toEqual(todos2);
    });

    it('should track status counts', async () => {
      const todos: TodoItem[] = [
        { content: 'Task 1', status: 'pending', activeForm: 'Doing 1' },
        { content: 'Task 2', status: 'pending', activeForm: 'Doing 2' },
        { content: 'Task 3', status: 'in_progress', activeForm: 'Doing 3' },
        { content: 'Task 4', status: 'completed', activeForm: 'Doing 4' },
        { content: 'Task 5', status: 'completed', activeForm: 'Doing 5' },
      ];

      const result = await tool.execute({ action: 'write', todos }, { conversationId: 'conv1' });

      expect(result.success).toBe(true);
      expect(result.metadata?.pending).toBe(2);
      expect(result.metadata?.inProgress).toBe(1);
      expect(result.metadata?.completed).toBe(2);
    });

    it('should isolate by conversation', async () => {
      const todos1: TodoItem[] = [
        { content: 'Conv1 Task', status: 'pending', activeForm: 'Doing task' },
      ];

      const todos2: TodoItem[] = [
        { content: 'Conv2 Task', status: 'pending', activeForm: 'Doing task' },
      ];

      await tool.execute({ action: 'write', todos: todos1 }, { conversationId: 'conv1' });
      await tool.execute({ action: 'write', todos: todos2 }, { conversationId: 'conv2' });

      const result1 = await tool.execute({ action: 'read' }, { conversationId: 'conv1' });
      const result2 = await tool.execute({ action: 'read' }, { conversationId: 'conv2' });

      expect(result1.output).toEqual(todos1);
      expect(result2.output).toEqual(todos2);
    });

    it('should return error if todos missing for write', async () => {
      const result = await tool.execute({ action: 'write' }, { conversationId: 'conv1' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });
  });
});
