// Tools exports

// Types
export * from './types.js';

// Interfaces
export type { ITool } from './interfaces/ITool.js';

// Base classes
export { BaseTool } from './BaseTool.js';

// Registry
export { ToolRegistry } from './ToolRegistry.js';

// Built-in tools
export { ReadFileTool } from './built-in/ReadFileTool.js';
export { WriteFileTool } from './built-in/WriteFileTool.js';
export { DiffTool } from './built-in/DiffTool.js';
export { GrepTool } from './built-in/GrepTool.js';
export { GlobTool } from './built-in/GlobTool.js';
export { BashTool } from './built-in/BashTool.js';
export { TodoTool } from './built-in/TodoTool.js';
export type { TodoItem, ITodoStorage } from './built-in/TodoTool.js';
export { TaskTool } from './built-in/TaskTool.js';
export type { IAgentSpawner } from './built-in/TaskTool.js';

// Version
export const TOOLS_VERSION = '0.1.0';
