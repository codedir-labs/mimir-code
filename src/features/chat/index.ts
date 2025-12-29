/**
 * Chat feature - Interactive chat and main agent
 * Public API exports
 */

// Commands
export { ChatCommand } from './commands/ChatCommand.js';

// Agent - Re-export from mimir-agents package
export { Agent } from '@codedir/mimir-agents/core';
export type {
  IAgent,
  AgentConfig,
  AgentResult,
  AgentBudget,
  AgentStatus,
} from '@codedir/mimir-agents/core';

// Components
export { ChatInterface } from './components/ChatInterface.js';
export { ChatApp } from './components/ChatApp.js';
export { MessageList } from './components/MessageList.js';
export { InputBox } from './components/InputBox.js';
export { AgentSelectionUI } from './components/AgentSelectionUI.js';
export { ModelSelectionView } from './components/ModelSelectionView.js';
export { MultiAgentProgressView } from './components/MultiAgentProgressView.js';
export { AgentProgressRow } from './components/AgentProgressRow.js';
export { AgentDetailView } from './components/AgentDetailView.js';
export type { AgentProgressData } from './components/AgentProgressRow.js';
export type { AgentDetailData, TodoItem } from './components/AgentDetailView.js';

// Slash commands
export * from './slash-commands/index.js';

// Types (placeholder - will be created as needed)
// export type { ... } from './types.js';
