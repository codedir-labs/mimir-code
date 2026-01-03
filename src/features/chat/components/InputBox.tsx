/**
 * Input box component
 * User input field with prompt and autocomplete support
 *
 * Keyboard behavior:
 * - App-level shortcuts (Tab, Escape, Ctrl+C, mode switch) handled by ChatInterface via KeyboardEventBus
 * - Text editing handled natively by custom TextInput component:
 *   - Home/End: Jump to start/end of line
 *   - Ctrl+Left/Right: Word navigation
 *   - Ctrl+A/Ctrl+E: Start/end of line (emacs style)
 *   - Backspace/Delete: Character deletion (Delete works correctly - forward)
 *   - Ctrl+Backspace/Delete: Word deletion
 *   - Ctrl+U: Clear to line start
 *   - Ctrl+K: Clear to line end
 *   - Ctrl+W: Delete word backward
 *
 * Parameter detection (bash COMP_WORDS pattern):
 * - `/command param ` (trailing space) → shows NEXT parameter if exists
 * - `/command param` (no space) → shows completions for CURRENT parameter
 * - No autocomplete shown if no more parameters available
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import { TextInput } from '@/shared/ui/TextInput.js';
import { Theme, KeyBindingsConfig } from '@/shared/config/schemas.js';
import { getTheme } from '@/shared/config/themes/index.js';
import { SlashCommandRegistry, SlashCommandContext } from '@/features/chat/slash-commands/SlashCommand.js';
import { SlashCommandParser, type ParseResult } from '@/features/custom-commands/parser/SlashCommandParser.js';
import { CommandAutocomplete } from '@/shared/ui/CommandAutocomplete.js';
import { ISlashCommand } from '@/features/chat/slash-commands/SlashCommand.js';
import {
  enableBracketedPaste,
  disableBracketedPaste,
  detectPasteHeuristic,
  stripBracketedPasteMarkers,
} from '@/shared/utils/bracketedPaste.js';
import { pasteLog, pasteLogContent, pasteLogSeparator } from '@/shared/utils/pasteLogger.js';
import type { PasteMetadata } from '@/features/chat/types/attachment.js';

/** Empty suggestion result for early returns */
const EMPTY_SUGGESTION = { show: false, isParam: false, commands: [] as ISlashCommand[], params: [] as string[], paramName: '' };

/** Regex constant for trailing whitespace */
const TRAILING_WHITESPACE_REGEX = /\s$/;

/** Build suggestion result for parameters */
function buildParamSuggestion(suggestions: string[], paramName: string): typeof EMPTY_SUGGESTION {
  if (suggestions.length === 0) return EMPTY_SUGGESTION;
  return { show: true, isParam: true, commands: [], params: suggestions, paramName };
}

/** Calculate parameter suggestions for a parsed command */
function calculateParameterSuggestions(
  parsed: ParseResult,
  commandRegistry: SlashCommandRegistry,
  context: SlashCommandContext | undefined,
  value: string
): typeof EMPTY_SUGGESTION {
  if (!parsed.commandName) return EMPTY_SUGGESTION;
  const command = commandRegistry.get(parsed.commandName);
  if (!command?.getParameterSuggestions || !context) return EMPTY_SUGGESTION;

  const currentInput = parsed.rawArgs || '';
  const parts = currentInput.split(/\s+/).filter((a) => a.length > 0);
  const endsWithSpace = TRAILING_WHITESPACE_REGEX.test(value);

  // Handle trailing space case - looking for next parameter
  if (endsWithSpace) {
    const paramIndex = parts.length;
    const suggestions = command.getParameterSuggestions(paramIndex, context, parts);
    return buildParamSuggestion(suggestions, command.parameters?.[paramIndex]?.name || 'parameter');
  }

  // Calculate parameter index and partial value
  const paramIndex = parts.length === 0 ? 0 : parts.length - 1;
  const partialValue = parts.length === 0 ? '' : (parts[parts.length - 1]?.toLowerCase() || '');

  // Get and filter suggestions
  const completedArgs = paramIndex > 0 ? parts.slice(0, paramIndex) : [];
  const allSuggestions = command.getParameterSuggestions(paramIndex, context, completedArgs);
  const filteredSuggestions = partialValue
    ? allSuggestions.filter((s) => s.toLowerCase().startsWith(partialValue))
    : allSuggestions;

  return buildParamSuggestion(filteredSuggestions, command.parameters?.[paramIndex]?.name || 'parameter');
}

/** Result of accepting a parameter selection */
interface AcceptParameterResult {
  newValue: string;
  shouldExecute: boolean;
}

/** Build completed args for parameter selection */
function buildCompletedArgs(parsed: ParseResult, selected: string): string[] | null {
  const currentInput = parsed.rawArgs || '';
  const parts = currentInput.split(/\s+/).filter((a) => a.length > 0);
  const endsWithSpace = currentInput.length > 0 && TRAILING_WHITESPACE_REGEX.test(currentInput);

  if (endsWithSpace || parts.length === 0) {
    return [...parts, selected]; // Adding new argument
  }
  return [...parts.slice(0, -1), selected]; // Replacing last partial argument
}

/** Accept a parameter suggestion and determine next action */
function acceptParameterSelection(
  selected: string,
  value: string,
  commandRegistry: SlashCommandRegistry | undefined,
  context: SlashCommandContext | undefined,
  autocompleteExecuteOnSelect: boolean
): AcceptParameterResult | null {
  const parsed = SlashCommandParser.parse(value);
  const commandName = parsed.commandName;
  if (!commandName) return null;

  const completedArgs = buildCompletedArgs(parsed, selected);
  if (!completedArgs) return null;

  const newValue = `/${commandName} ${completedArgs.join(' ')} `;

  // Check if there are more parameters expected
  const command = commandRegistry?.get(commandName);
  const hasMoreParams = command?.getParameterSuggestions && context
    ? command.getParameterSuggestions(completedArgs.length, context, completedArgs).length > 0
    : false;

  return {
    newValue,
    shouldExecute: !hasMoreParams && autocompleteExecuteOnSelect,
  };
}

/** Accept a command suggestion and determine next action */
function acceptCommandSelection(
  selectedCommand: ISlashCommand,
  context: SlashCommandContext | undefined,
  autocompleteExecuteOnSelect: boolean
): AcceptParameterResult {
  const newValue = `/${selectedCommand.name} `;

  // Check if command has parameters
  const hasParams = selectedCommand.getParameterSuggestions && context
    ? selectedCommand.getParameterSuggestions(0, context, []).length > 0
    : false;

  return {
    newValue,
    shouldExecute: !hasParams && autocompleteExecuteOnSelect,
  };
}

/** Creates regex for control characters in paste preview (ASCII 0-31) */
function createControlCharRegex(): RegExp {
  // Build pattern using char codes to avoid sonarjs/no-control-regex
  const pattern = `[${String.fromCharCode(0)}-${String.fromCharCode(31)}]`;
  return new RegExp(pattern, 'g');
}
const CONTROL_CHAR_REGEX = createControlCharRegex();

/** Hook result for autocomplete state */
interface AutocompleteState {
  filteredCommands: ISlashCommand[];
  parameterSuggestions: string[];
  parameterName: string;
  isParameterMode: boolean;
  autocompleteHeight: number;
  handleHeightCalculated: (height: number) => void;
}

/** Custom hook for autocomplete logic */
function useAutocompleteState(
  value: string,
  commandRegistry: SlashCommandRegistry | undefined,
  context: SlashCommandContext | undefined,
  showAutocomplete: boolean,
  onAutocompleteStateChange: InputBoxProps['onAutocompleteStateChange']
): AutocompleteState {
  const [filteredCommands, setFilteredCommands] = useState<ISlashCommand[]>([]);
  const [parameterSuggestions, setParameterSuggestions] = useState<string[]>([]);
  const [parameterName, setParameterName] = useState<string>('');
  const [isParameterMode, setIsParameterMode] = useState(false);
  const [autocompleteHeight, setAutocompleteHeight] = useState(0);

  // Calculate suggestions
  const calculateSuggestions = useCallback(() => {
    if (!commandRegistry) return EMPTY_SUGGESTION;
    const trimmed = value.trim();
    if (!trimmed.startsWith('/')) return EMPTY_SUGGESTION;

    const parsed = SlashCommandParser.parse(value);
    const hasSpace = value.includes(' ');

    if (parsed.isCommand && parsed.commandName && hasSpace) {
      return calculateParameterSuggestions(parsed, commandRegistry, context, value);
    }

    if (hasSpace) return EMPTY_SUGGESTION;
    const partialName = SlashCommandParser.getPartialCommandName(value);
    if (partialName === null) return EMPTY_SUGGESTION;

    const matches = commandRegistry.search(partialName);
    return { show: matches.length > 0, isParam: false, commands: matches, params: [] as string[], paramName: '' };
  }, [value, commandRegistry, context]);

  // Update state when suggestions change
  useEffect(() => {
    const suggestions = calculateSuggestions();
    setIsParameterMode(suggestions.isParam);
    setFilteredCommands(suggestions.commands);
    setParameterSuggestions(suggestions.params);
    setParameterName(suggestions.paramName);

    const itemCount = suggestions.isParam ? suggestions.params.length : suggestions.commands.length;
    onAutocompleteStateChange?.({
      itemCount,
      isParameterMode: suggestions.isParam,
      shouldShow: suggestions.show && itemCount > 0,
    });
  }, [calculateSuggestions, onAutocompleteStateChange]);

  // Reset height when hidden
  useEffect(() => {
    if (!showAutocomplete) setAutocompleteHeight(0);
  }, [showAutocomplete]);

  // Report height changes
  useEffect(() => {
    const itemCount = isParameterMode ? parameterSuggestions.length : filteredCommands.length;
    onAutocompleteStateChange?.({
      itemCount,
      isParameterMode,
      shouldShow: showAutocomplete && itemCount > 0,
      actualHeight: showAutocomplete ? autocompleteHeight : 0,
    });
  }, [autocompleteHeight, isParameterMode, parameterSuggestions.length, filteredCommands.length, showAutocomplete, onAutocompleteStateChange]);

  const handleHeightCalculated = useCallback((height: number) => setAutocompleteHeight(height), []);

  return { filteredCommands, parameterSuggestions, parameterName, isParameterMode, autocompleteHeight, handleHeightCalculated };
}

/** Paste handling refs and state */
interface PasteHandlingRefs {
  previousValueRef: React.MutableRefObject<string>;
  pasteHandledTimeRef: React.MutableRefObject<number>;
  skipNextHeuristicRef: React.MutableRefObject<boolean>;
}

/** Custom hook for paste handling logic */
function usePasteHandling(
  value: string,
  onChange: (value: string) => void,
  onPaste: ((content: string, metadata: PasteMetadata) => void) | undefined,
  bracketedPasteEnabled: boolean,
  setInputKey: React.Dispatch<React.SetStateAction<number>>
): PasteHandlingRefs {
  const previousValueRef = useRef(value);
  const pasteHandledTimeRef = useRef(0);
  const skipNextHeuristicRef = useRef(false);
  const hasCheckedInitialValueRef = useRef(false);

  // Detect pre-buffered paste (value has content at mount time)
  useEffect(() => {
    if (hasCheckedInitialValueRef.current) return;
    hasCheckedInitialValueRef.current = true;
    if (value.length <= PRE_MOUNT_PASTE_THRESHOLD || !onPaste) return;

    pasteLog('InputBox', 'DETECTED PRE-MOUNT PASTE', { valueLen: value.length });
    previousValueRef.current = '';
    onChange('');
    setInputKey((prev) => prev + 1);
    onPaste(value, { isBracketedPaste: false, detectMethod: 'pre-mount', originalLength: value.length });
  }, [value, onChange, onPaste, setInputKey]);

  // Enable/disable bracketed paste mode
  useEffect(() => {
    if (bracketedPasteEnabled) {
      enableBracketedPaste();
      return () => { disableBracketedPaste(); };
    }
    return undefined;
  }, [bracketedPasteEnabled]);

  return { previousValueRef, pasteHandledTimeRef, skipNextHeuristicRef };
}

/** Paste cooldown in milliseconds */
const PASTE_COOLDOWN_MS = 500;

/** Log tag for handleChange */
const LOG_TAG_HANDLE_CHANGE = 'InputBox.handleChange';

/** Apply autocomplete selection result */
function applySelectionResult(
  result: AcceptParameterResult | null,
  setInputKey: React.Dispatch<React.SetStateAction<number>>,
  onChange: (value: string) => void,
  onSubmit: (value: string) => void
): void {
  if (!result) return;
  setInputKey((prev) => prev + 1);
  if (result.shouldExecute) {
    const finalValue = result.newValue.trim();
    onChange(finalValue);
    setTimeout(() => onSubmit(finalValue), 0);
  } else {
    onChange(result.newValue);
  }
}

/** Minimum value length to detect pre-mount paste */
const PRE_MOUNT_PASTE_THRESHOLD = 10;

/** Format control character for debug output */
function formatControlChar(c: string): string {
  return `<${c.charCodeAt(0).toString(16)}>`;
}

/** Check if we should block input during paste cooldown */
function isInPasteCooldown(pasteHandledTime: number): boolean {
  return Date.now() - pasteHandledTime < PASTE_COOLDOWN_MS;
}

/** Process input change and detect paste events */
function processInputChange(
  newValue: string,
  previousValue: string,
  skipHeuristic: boolean,
  onPaste: ((content: string, metadata: PasteMetadata) => void) | undefined
): { handled: boolean; cleanedValue: string; wasPaste: boolean } {
  const cleanedValue = stripBracketedPasteMarkers(newValue);
  const hadMarkers = cleanedValue !== newValue;

  // Skip heuristic detection if flagged (after paste handling)
  if (skipHeuristic) {
    pasteLog(LOG_TAG_HANDLE_CHANGE, 'Skipping heuristic (post-paste sync)');
    return { handled: true, cleanedValue, wasPaste: false };
  }

  // Heuristic paste detection (fallback for terminals without bracketed paste)
  if (hadMarkers || detectPasteHeuristic(cleanedValue, previousValue)) {
    const delta = cleanedValue.length - previousValue.length;
    pasteLog(LOG_TAG_HANDLE_CHANGE, 'Detected as paste', { hadMarkers, delta });
    if (onPaste) {
      const metadata: PasteMetadata = {
        isBracketedPaste: hadMarkers,
        detectMethod: hadMarkers ? 'bracketed-partial' : 'heuristic',
        originalLength: cleanedValue.length,
      };
      onPaste(cleanedValue, metadata);
      return { handled: true, cleanedValue, wasPaste: true };
    }
  }

  return { handled: false, cleanedValue, wasPaste: false };
}

export interface InputBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value?: string) => void;
  theme: Theme;
  commandRegistry?: SlashCommandRegistry;
  // Context for parameter autocomplete
  context?: SlashCommandContext;
  // Callback when autocomplete visibility changes
  onAutocompleteChange?: (isShowing: boolean) => void;
  // Externally controlled autocomplete visibility (from parent keyboard handler)
  forceShowAutocomplete?: boolean;
  // Callback to report autocomplete state (item count for navigation, actual height for layout)
  onAutocompleteStateChange?: (state: {
    itemCount: number;
    isParameterMode: boolean;
    shouldShow: boolean;
    actualHeight?: number;
  }) => void;
  // Maximum number of visible items in autocomplete (dynamically calculated from terminal height)
  maxVisible?: number;
  // Selected autocomplete index (controlled from parent)
  autocompleteIndex?: number;
  // Callback when autocomplete index changes
  onAutocompleteIndexChange?: (index: number) => void;
  // Ref to expose accept selection function to parent
  onAcceptSelectionRef?: React.MutableRefObject<(() => void) | null>;
  // Keyboard bindings for autocomplete footer
  keyBindings: KeyBindingsConfig;
  // Execute command immediately if no more parameters needed
  autocompleteExecuteOnSelect?: boolean;
  // Paste detection enabled (default: true)
  bracketedPasteEnabled?: boolean;
  // Callback when paste is detected
  onPaste?: (content: string, metadata: PasteMetadata) => void;
  // Callback when cursor position changes
  onCursorChange?: (position: number) => void;
  // Set of valid attachment numbers (for highlighting invalid #[n] refs)
  validAttachmentNums?: Set<string>;
  // Request cursor to move to this position
  requestCursorAt?: { position: number; token: number };
}

export const InputBox: React.FC<InputBoxProps> = React.memo(
  ({
    value,
    onChange,
    onSubmit,
    theme,
    commandRegistry,
    context,
    onAutocompleteChange,
    forceShowAutocomplete,
    onAutocompleteStateChange,
    autocompleteIndex,
    onAutocompleteIndexChange: _onAutocompleteIndexChange,
    onAcceptSelectionRef,
    maxVisible = 5,
    keyBindings,
    autocompleteExecuteOnSelect = true,
    bracketedPasteEnabled = true,
    onPaste,
    onCursorChange,
    validAttachmentNums,
    requestCursorAt,
  }) => {
    const themeDefinition = getTheme(theme);
    const [inputKey, setInputKey] = useState(0);

    // Local state for autocomplete (with external override)
    const showAutocomplete = forceShowAutocomplete ?? false;
    const selectedIndex = autocompleteIndex ?? 0;

    // Use custom hook for autocomplete logic
    const { filteredCommands, parameterSuggestions, parameterName, isParameterMode, handleHeightCalculated } =
      useAutocompleteState(value, commandRegistry, context, showAutocomplete, onAutocompleteStateChange);

    // Use custom hook for paste handling
    const { previousValueRef, pasteHandledTimeRef, skipNextHeuristicRef } =
      usePasteHandling(value, onChange, onPaste, bracketedPasteEnabled, setInputKey);

    // Notify parent when autocomplete visibility changes
    useEffect(() => {
      onAutocompleteChange?.(showAutocomplete);
    }, [showAutocomplete, onAutocompleteChange]);

    // Accept autocomplete selection (called by parent when Tab/Enter pressed)
    const acceptSelection = useCallback(() => {
      const itemCount = isParameterMode ? parameterSuggestions.length : filteredCommands.length;
      if (itemCount === 0) return;

      const apply = (r: AcceptParameterResult | null) => applySelectionResult(r, setInputKey, onChange, onSubmit);

      if (isParameterMode) {
        const selected = parameterSuggestions[selectedIndex];
        if (selected) apply(acceptParameterSelection(selected, value, commandRegistry, context, autocompleteExecuteOnSelect));
      } else {
        const cmd = filteredCommands[selectedIndex];
        if (cmd) apply(acceptCommandSelection(cmd, context, autocompleteExecuteOnSelect));
      }
    }, [isParameterMode, parameterSuggestions, filteredCommands, selectedIndex, value, onChange, onSubmit, commandRegistry, context, autocompleteExecuteOnSelect]);

    // Expose accept selection function to parent via ref
    useEffect(() => {
      if (onAcceptSelectionRef) onAcceptSelectionRef.current = acceptSelection;
    }, [onAcceptSelectionRef, acceptSelection]);

    // Handle complete paste from TextInput (buffered bracketed paste content)
    const handleTextInputPaste = useCallback(
      (content: string) => {
        pasteLogSeparator('InputBox.handleTextInputPaste');
        pasteLog('InputBox', 'paste', { len: content.length, hasHandler: !!onPaste });
        pasteLogContent('InputBox-CONTENT', content);
        pasteHandledTimeRef.current = Date.now();
        const metadata: PasteMetadata = { isBracketedPaste: true, detectMethod: 'bracketed', originalLength: content.length };
        if (onPaste) {
          onPaste(content, metadata);
          skipNextHeuristicRef.current = true;
        } else {
          previousValueRef.current = content;
          onChange(content);
        }
      },
      [onChange, onPaste]
    );

    // Handle input changes (normal typing, not pastes)
    const handleChange = useCallback(
      (newValue: string) => {
        // Log all changes for debugging
        pasteLog(LOG_TAG_HANDLE_CHANGE, 'CALLED', {
          newValueLen: newValue.length,
          prevValueLen: previousValueRef.current.length,
          delta: newValue.length - previousValueRef.current.length,
          hasNewlines: newValue.includes('\n'),
          preview: newValue.substring(0, 50).replace(CONTROL_CHAR_REGEX, formatControlChar),
        });

        // Block changes during paste cooldown
        if (isInPasteCooldown(pasteHandledTimeRef.current)) {
          pasteLog(LOG_TAG_HANDLE_CHANGE, 'BLOCKED (cooldown)');
          return;
        }

        // Process input and detect paste events
        const result = processInputChange(
          newValue, previousValueRef.current, skipNextHeuristicRef.current, onPaste
        );

        if (result.wasPaste) {
          skipNextHeuristicRef.current = true;
          return;
        }

        skipNextHeuristicRef.current = false;
        previousValueRef.current = result.cleanedValue;

        if (!result.handled) {
          pasteLog(LOG_TAG_HANDLE_CHANGE, 'Calling onChange normally');
          onChange(result.cleanedValue);
        }
      },
      [onChange, onPaste]
    );

    const handleSubmit = useCallback(() => {
      // NOTE: Don't handle autocomplete selection here!
      // The parent (ChatInterface) handles autocomplete acceptance via keyboard actions
      // (acceptSelectionRef). If we also call acceptSelection here, we get double submission.
      //
      // This handler is ONLY for normal text submission when autocomplete is NOT active.
      // When autocomplete IS active, the parent's keyboard handler intercepts Enter/Tab first.
      //
      // We check showAutocomplete here to prevent double-submit on the edge case where
      // the keyboard handler was called but the keypress also reached TextInput.
      if (showAutocomplete) {
        // Autocomplete is showing - parent handles this via keyboard action
        // Don't do anything here to prevent double submission
        return;
      }

      // Submit normally (no autocomplete active)
      onSubmit(undefined);
    }, [
      showAutocomplete,
      onSubmit,
    ]);

    // Text editing is handled natively by the custom TextInput component
    // No useKeyboardAction hooks needed here - TextInput handles:
    // Home/End, Ctrl+Left/Right, Ctrl+A/E, Backspace/Delete, Ctrl+U/K/W, etc.

    return (
      <Box flexDirection="column" flexShrink={0}>
        {/* Input line - always anchored at same position */}
        <Box paddingX={1} flexShrink={0}>
          <Text>{themeDefinition.colors.inputPrompt('> ')}</Text>
          <TextInput
            key={inputKey}
            value={value}
            onChange={handleChange}
            onSubmit={handleSubmit}
            onPaste={handleTextInputPaste}
            onCursorChange={onCursorChange}
            focus={true}
            theme={theme}
            validAttachmentNums={validAttachmentNums}
            requestCursorAt={requestCursorAt}
          />
        </Box>

        {/* Autocomplete appears BELOW input line */}
        {showAutocomplete && (
          <CommandAutocomplete
            commands={isParameterMode ? undefined : filteredCommands}
            parameterSuggestions={isParameterMode ? parameterSuggestions : undefined}
            parameterName={isParameterMode ? parameterName : undefined}
            selectedIndex={selectedIndex}
            showParameterInfo={!isParameterMode}
            selectedCommand={isParameterMode ? undefined : filteredCommands[selectedIndex]}
            theme={theme}
            maxVisible={maxVisible}
            keyBindings={keyBindings}
            onHeightCalculated={handleHeightCalculated}
          />
        )}
      </Box>
    );
  }
);

InputBox.displayName = 'InputBox';
