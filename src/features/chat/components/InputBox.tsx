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
import { SlashCommandParser } from '@/features/custom-commands/parser/SlashCommandParser.js';
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
    const [filteredCommands, setFilteredCommands] = useState<ISlashCommand[]>([]);
    const [parameterSuggestions, setParameterSuggestions] = useState<string[]>([]);
    const [parameterName, setParameterName] = useState<string>('');
    const [isParameterMode, setIsParameterMode] = useState(false);
    const [inputKey, setInputKey] = useState(0);
    const [autocompleteHeight, setAutocompleteHeight] = useState(0);

    // Local state for autocomplete (with external override)
    const [localShowAutocomplete] = useState(false);
    const [localSelectedIndex] = useState(0);

    // Use external control if provided, otherwise use local state
    const showAutocomplete = forceShowAutocomplete ?? localShowAutocomplete;
    const selectedIndex = autocompleteIndex ?? localSelectedIndex;

    // Track previous value for heuristic paste detection
    const previousValueRef = useRef(value);

    // Track when paste was last handled to block handleChange during cooldown
    const pasteHandledTimeRef = useRef(0);

    // Track that we need to sync previousValueRef after paste (skip heuristic on next change)
    const skipNextHeuristicRef = useRef(false);

    // CRITICAL: Detect if value has content at mount time (pre-buffered paste)
    // This runs synchronously during first render
    const hasCheckedInitialValueRef = useRef(false);
    useEffect(() => {
      if (!hasCheckedInitialValueRef.current && value.length > 10) {
        hasCheckedInitialValueRef.current = true;
        pasteLog('InputBox', 'DETECTED PRE-MOUNT PASTE in value', { valueLen: value.length });
        // The value already has garbage - we need to emit it as paste and clear
        if (onPaste) {
          const content = value;
          pasteLog('InputBox', 'Emitting pre-mount paste and clearing');
          // Clear immediately
          previousValueRef.current = '';
          onChange('');
          setInputKey((prev) => prev + 1);
          // Emit as paste
          onPaste(content, {
            isBracketedPaste: false,
            detectMethod: 'pre-mount',
            originalLength: content.length,
          });
        }
      }
      hasCheckedInitialValueRef.current = true;
    }, [value, onChange, onPaste]);

    // Enable/disable bracketed paste mode
    useEffect(() => {
      if (bracketedPasteEnabled) {
        enableBracketedPaste();
        return () => {
          disableBracketedPaste();
        };
      }
      return undefined;
    }, [bracketedPasteEnabled]);

    // Notify parent when autocomplete visibility changes
    useEffect(() => {
      if (onAutocompleteChange) {
        onAutocompleteChange(showAutocomplete);
      }
    }, [showAutocomplete, onAutocompleteChange]);

    // Calculate autocomplete suggestions based on current input
    // Based on bash COMP_WORDS pattern - detect parameter boundaries with space
    const calculateSuggestions = useCallback(() => {
      if (!commandRegistry) {
        return { show: false, isParam: false, commands: [], params: [], paramName: '' };
      }

      const trimmed = value.trim();

      // Not a slash command at all
      if (!trimmed.startsWith('/')) {
        return { show: false, isParam: false, commands: [], params: [], paramName: '' };
      }

      const parsed = SlashCommandParser.parse(value);

      // Check for parameter mode - when there's a space after command
      if (parsed.isCommand && parsed.commandName && value.includes(' ')) {
        const command = commandRegistry.get(parsed.commandName);

        // Only show parameter autocomplete if command has parameter suggestions
        if (command?.getParameterSuggestions && context) {
          const currentInput = parsed.rawArgs || '';

          // Split into word boundaries (like bash COMP_WORDS)
          // Filter out empty strings
          const parts = currentInput.split(/\s+/).filter((a) => a.length > 0);

          // Detect if we're at a parameter boundary (trailing space after last param)
          // Pattern: "/command param " vs "/command param"
          // Check original value for trailing space (handles "/theme " where rawArgs is empty)
          const endsWithSpace = /\s$/.test(value);

          let paramIndex: number;
          let partialValue: string;

          if (endsWithSpace) {
            // Trailing space = finished with current param, ready for NEXT parameter
            // e.g., "/model deepseek " -> parts=['deepseek'], paramIndex=1
            // Only show autocomplete if the NEXT parameter exists
            paramIndex = parts.length;
            partialValue = '';

            // Check if next parameter exists
            // Pass already-typed args so commands can provide context-aware suggestions
            const nextParamSuggestions = command.getParameterSuggestions(
              paramIndex,
              context,
              parts
            );
            if (nextParamSuggestions.length === 0) {
              // No next parameter - don't show autocomplete
              return { show: false, isParam: false, commands: [], params: [], paramName: '' };
            }

            return {
              show: true,
              isParam: true,
              commands: [],
              params: nextParamSuggestions,
              paramName: command.parameters?.[paramIndex]?.name || 'parameter',
            };
          } else if (parts.length === 0) {
            // No arguments yet " " after command - first parameter
            paramIndex = 0;
            partialValue = '';
          } else {
            // No trailing space = still typing current parameter
            // e.g., "/model dee" -> parts=['dee'], paramIndex=0
            paramIndex = parts.length - 1;
            partialValue = parts[parts.length - 1]?.toLowerCase() || '';
          }

          // Pass completed args (all but the last partial one) for context-aware suggestions
          const completedArgs = paramIndex > 0 ? parts.slice(0, paramIndex) : [];
          const allSuggestions = command.getParameterSuggestions(
            paramIndex,
            context,
            completedArgs
          );

          // Filter suggestions based on partial value
          const filteredSuggestions = partialValue
            ? allSuggestions.filter((s) => s.toLowerCase().startsWith(partialValue))
            : allSuggestions;

          if (filteredSuggestions.length > 0) {
            return {
              show: true,
              isParam: true,
              commands: [],
              params: filteredSuggestions,
              paramName: command.parameters?.[paramIndex]?.name || 'parameter',
            };
          }
        }

        // No parameter suggestions available
        return { show: false, isParam: false, commands: [], params: [], paramName: '' };
      }

      // Command autocomplete mode - only if no space yet (still typing command name)
      const partialName = SlashCommandParser.getPartialCommandName(value);

      if (partialName === null) {
        return { show: false, isParam: false, commands: [], params: [], paramName: '' };
      }

      // Only show command autocomplete if there's no space (still typing command name)
      const hasSpace = value.includes(' ');
      if (hasSpace) {
        return { show: false, isParam: false, commands: [], params: [], paramName: '' };
      }

      const matches = commandRegistry.search(partialName);

      return {
        show: matches.length > 0,
        isParam: false,
        commands: matches,
        params: [],
        paramName: '',
      };
    }, [value, commandRegistry, context]);

    // Update autocomplete suggestions when input changes
    useEffect(() => {
      const suggestions = calculateSuggestions();

      setIsParameterMode(suggestions.isParam);
      setFilteredCommands(suggestions.commands);
      setParameterSuggestions(suggestions.params);
      setParameterName(suggestions.paramName);

      // Notify parent about autocomplete state (item count for navigation)
      const itemCount = suggestions.isParam
        ? suggestions.params.length
        : suggestions.commands.length;

      if (onAutocompleteStateChange) {
        onAutocompleteStateChange({
          itemCount,
          isParameterMode: suggestions.isParam,
          shouldShow: suggestions.show && itemCount > 0,
        });
      }
    }, [calculateSuggestions, onAutocompleteStateChange]);

    // Callback to receive actual rendered height from CommandAutocomplete
    const handleHeightCalculated = useCallback((height: number) => {
      setAutocompleteHeight(height);
    }, []);

    // Reset height when autocomplete is hidden
    useEffect(() => {
      if (!showAutocomplete) {
        setAutocompleteHeight(0);
      }
    }, [showAutocomplete]);

    // Report autocomplete state changes to parent
    useEffect(() => {
      const itemCount = isParameterMode ? parameterSuggestions.length : filteredCommands.length;

      if (onAutocompleteStateChange) {
        onAutocompleteStateChange({
          itemCount,
          isParameterMode,
          shouldShow: showAutocomplete && itemCount > 0,
          actualHeight: showAutocomplete ? autocompleteHeight : 0,
        });
      }
    }, [
      autocompleteHeight,
      isParameterMode,
      parameterSuggestions.length,
      filteredCommands.length,
      showAutocomplete,
      onAutocompleteStateChange,
    ]);

    // Accept autocomplete selection (called by parent when Tab/Enter pressed)
    const acceptSelection = useCallback(() => {
      const itemCount = isParameterMode ? parameterSuggestions.length : filteredCommands.length;
      if (itemCount === 0) return;

      if (isParameterMode) {
        // Select parameter suggestion
        const selected = parameterSuggestions[selectedIndex];
        if (selected) {
          const parsed = SlashCommandParser.parse(value);
          const currentInput = parsed.rawArgs || '';

          // Split into word boundaries
          const parts = currentInput.split(/\s+/).filter((a) => a.length > 0);
          const endsWithSpace = currentInput.length > 0 && /\s$/.test(currentInput);

          let completedArgs: string[];
          if (endsWithSpace || parts.length === 0) {
            // Adding new argument
            completedArgs = [...parts, selected];
          } else {
            // Replacing last partial argument
            completedArgs = [...parts.slice(0, -1), selected];
          }

          const commandName = parsed.commandName;
          if (!commandName) return;

          const baseCommand = `/${commandName}`;
          const newValue = `${baseCommand} ${completedArgs.join(' ')} `;

          // Check if there are more parameters expected
          const command = commandRegistry?.get(commandName);
          const hasMoreParams =
            command?.getParameterSuggestions && context
              ? command.getParameterSuggestions(completedArgs.length, context, completedArgs)
                  .length > 0
              : false;

          if (!hasMoreParams && autocompleteExecuteOnSelect) {
            // No more parameters - auto-execute (if enabled)
            setInputKey((prev) => prev + 1);
            const finalValue = newValue.trim();
            onChange(finalValue);
            // Pass value directly to onSubmit to avoid stale state issues
            setTimeout(() => {
              onSubmit(finalValue);
            }, 0);
          } else {
            // More parameters expected or auto-execute disabled - add trailing space and continue
            setInputKey((prev) => prev + 1);
            onChange(newValue);
          }
        }
      } else {
        // Select command
        const selectedCommand = filteredCommands[selectedIndex];
        if (selectedCommand) {
          const newValue = `/${selectedCommand.name} `;

          // Check if command has parameters
          const hasParams =
            selectedCommand.getParameterSuggestions && context
              ? selectedCommand.getParameterSuggestions(0, context, []).length > 0
              : false;

          if (!hasParams && autocompleteExecuteOnSelect) {
            // No parameters - auto-execute (if enabled)
            setInputKey((prev) => prev + 1);
            const finalValue = newValue.trim();
            onChange(finalValue);
            // Pass value directly to onSubmit to avoid stale state issues
            setTimeout(() => {
              onSubmit(finalValue);
            }, 0);
          } else {
            // Has parameters or auto-execute disabled - add trailing space and continue
            setInputKey((prev) => prev + 1);
            onChange(newValue);
          }
        }
      }
    }, [
      isParameterMode,
      parameterSuggestions,
      filteredCommands,
      selectedIndex,
      value,
      onChange,
      onSubmit,
      commandRegistry,
      context,
      autocompleteExecuteOnSelect,
    ]);

    // Expose accept selection function to parent via ref
    useEffect(() => {
      if (onAcceptSelectionRef) {
        onAcceptSelectionRef.current = acceptSelection;
      }
    }, [onAcceptSelectionRef, acceptSelection]);

    // Handle complete paste from TextInput (via onPaste callback)
    // TextInput now buffers bracketed paste content and emits the complete content
    const handleTextInputPaste = useCallback(
      (content: string) => {
        // FIRST LINE - log immediately to catch any early failures
        try {
          pasteLog('InputBox', '>>> handleTextInputPaste ENTRY <<<', { contentLen: content.length });
          // eslint-disable-next-line sonarjs/no-ignored-exceptions
        } catch {
          // Ignore logging errors - don't want to break paste functionality
        }

        // Capture stack trace to see who's calling this
        const stack = new Error().stack || 'no stack';
        pasteLogSeparator('InputBox.handleTextInputPaste CALLED');
        pasteLog('InputBox', 'handleTextInputPaste called', {
          contentLen: content.length,
          hasOnPaste: !!onPaste,
          currentValue: value,
          stack: stack.substring(0, 500),
        });
        pasteLogContent('InputBox-CONTENT', content);

        // Set cooldown timestamp to block any straggler handleChange calls
        pasteHandledTimeRef.current = Date.now();

        // DON'T clear the input - preserve existing content
        // Parent (ChatInterface) will append the reference or content
        pasteLog('InputBox', 'Preserving existing value', { currentValue: value });

        const metadata: PasteMetadata = {
          isBracketedPaste: true,
          detectMethod: 'bracketed',
          originalLength: content.length,
        };

        if (onPaste) {
          // Let parent (ChatInterface) handle paste
          pasteLog('InputBox', 'Calling parent onPaste handler');
          onPaste(content, metadata);
          // CRITICAL: Skip heuristic detection on next handleChange
          // Otherwise delta from old previousValueRef triggers paste detection again
          skipNextHeuristicRef.current = true;
          pasteLog('InputBox', 'Set skipNextHeuristic flag');
        } else {
          // No handler - just insert the content
          pasteLog('InputBox', 'No onPaste handler, inserting content directly');
          previousValueRef.current = content;
          onChange(content);
        }
        pasteLog('InputBox', 'handleTextInputPaste complete');
      },
      [onChange, onPaste, value]
    );

    // Handle input changes (normal typing, not pastes)
    const handleChange = useCallback(
      (newValue: string) => {
        // LOG ALL CHANGES - this is where we'll see what's actually happening
        const delta = newValue.length - previousValueRef.current.length;
        pasteLog('InputBox.handleChange', 'CALLED', {
          newValueLen: newValue.length,
          prevValueLen: previousValueRef.current.length,
          delta,
          hasNewlines: newValue.includes('\n'),
          // eslint-disable-next-line sonarjs/no-control-regex
          preview: newValue.substring(0, 50).replace(/[\x00-\x1f]/g, (c) => `<${c.charCodeAt(0).toString(16)}>`),
        });

        // Block changes during paste cooldown (500ms after paste was handled)
        // This prevents straggler events from corrupting the clean state
        const timeSincePaste = Date.now() - pasteHandledTimeRef.current;
        if (timeSincePaste < 500) {
          pasteLog('InputBox.handleChange', 'BLOCKED (cooldown)', { timeSincePaste });
          return;
        }

        // Safety: Strip any leftover paste markers that slipped through
        const cleanedValue = stripBracketedPasteMarkers(newValue);
        const hadMarkers = cleanedValue !== newValue;

        // Check if we should skip heuristic detection (after paste handling)
        if (skipNextHeuristicRef.current) {
          pasteLog('InputBox.handleChange', 'Skipping heuristic (post-paste sync)');
          skipNextHeuristicRef.current = false;
          previousValueRef.current = cleanedValue; // Sync to new value
          onChange(cleanedValue);
          return;
        }

        // Heuristic paste detection (fallback for terminals without bracketed paste)
        const previousValue = previousValueRef.current;
        if (hadMarkers || detectPasteHeuristic(cleanedValue, previousValue)) {
          pasteLog('InputBox.handleChange', 'Detected as paste', { hadMarkers, delta });
          const metadata: PasteMetadata = {
            isBracketedPaste: hadMarkers,
            detectMethod: hadMarkers ? 'bracketed-partial' : 'heuristic',
            originalLength: cleanedValue.length,
          };

          if (onPaste) {
            // Let parent handle paste
            onPaste(cleanedValue, metadata);
            skipNextHeuristicRef.current = true; // Skip next heuristic after this paste too
            return;
          }
        }

        // Update previousValueRef
        previousValueRef.current = cleanedValue;

        // Call onChange normally
        pasteLog('InputBox.handleChange', 'Calling onChange normally');
        onChange(cleanedValue);
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
