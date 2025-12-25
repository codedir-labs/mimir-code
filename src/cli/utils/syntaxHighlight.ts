/**
 * Syntax highlighting utility
 * Highlights code snippets using theme colors
 */

import { ThemeColors } from '../../config/themes/index.js';

export interface HighlightedToken {
  text: string;
  color: typeof import('chalk');
}

/**
 * Simple regex-based syntax highlighter for TypeScript/JavaScript
 */
export function highlightCode(code: string, themeColors: ThemeColors): string {
  let result = code;

  // Keywords
  const keywords =
    /\b(const|let|var|function|class|interface|type|export|import|from|return|if|else|for|while|async|await|new|this|extends|implements)\b/g;
  result = result.replace(keywords, (match) => themeColors.keyword(match));

  // Strings (both single and double quotes)
  const strings = /(['"`])(?:(?=(\\?))\2.)*?\1/g;
  result = result.replace(strings, (match) => themeColors.string(match));

  // Numbers
  const numbers = /\b\d+(\.\d+)?\b/g;
  result = result.replace(numbers, (match) => themeColors.number(match));

  // Comments
  const comments = /\/\/.*$/gm;
  result = result.replace(comments, (match) => themeColors.comment(match));

  // Function calls
  const functionCalls = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
  result = result.replace(functionCalls, (_match, name) => themeColors.function(name) + '(');

  return result;
}

/**
 * Get sample code for theme preview (hacker news meme with inline diff)
 */
export function getPreviewWithDiff(): Array<{ type: 'add' | 'remove' | 'normal'; line: string }> {
  return [
    { type: 'remove', line: 'function getRandomNumber() {' },
    { type: 'add', line: 'function getRandomNumber(): number {' },
    { type: 'normal', line: '  return 4;' },
    { type: 'normal', line: '}' },
  ];
}
