/**
 * Random tips displayed in the footer
 */

import { KeyBindingsConfig } from '@/shared/config/schemas.js';
import { formatKeyboardShortcut } from '@/shared/utils/keyboardFormatter.js';

/**
 * Generate tips array with dynamic keyboard shortcuts
 */
function generateTips(keyBindings: KeyBindingsConfig): string[] {
  const modeSwitchKey = formatKeyboardShortcut(keyBindings.modeSwitch, { showFirstOnly: true });
  const editKey = formatKeyboardShortcut(keyBindings.editCommand, { showFirstOnly: true });

  return [
    'Tip: Use /help to see all available commands',
    `Tip: Switch modes with ${modeSwitchKey} (Plan → Act → Discuss)`,
    'Tip: Type /plan <task> to create an execution plan',
    'Tip: Use /discuss <topic> to enter architect/discuss mode',
    'Tip: Your conversation history is automatically saved',
    'Tip: Check total costs with /cost to track your spending',
    `Tip: Use ${editKey} to edit your last command (coming soon)`,
    'Tip: The permission system keeps your code safe - review commands before they run',
    'Tip: Docker sandboxing isolates untrusted code execution',
    'Tip: MCP servers extend Mimir with custom tools and capabilities',
    'Tip: Use /model <provider> to switch between LLM providers',
    'Tip: Create checkpoints with /checkpoint to save your progress',
    'Tip: Configuration can be customized in .mimir/config.yml',
  ];
}

/**
 * Get a random tip with dynamic keyboard shortcuts
 */
export function getRandomTip(keyBindings: KeyBindingsConfig): string {
  const tips = generateTips(keyBindings);
  const randomIndex = Math.floor(Math.random() * tips.length);
  return tips[randomIndex] ?? 'Tip: Use keyboard shortcuts for faster navigation';
}
