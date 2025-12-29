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
  detectBracketedPaste,
  detectPasteHeuristic,
} from '@/shared/utils/bracketedPaste.js';
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
  }) => {
    const themeDefinition = getTheme(theme);
    const [filteredCommands, setFilteredCommands] = useState<ISlashCommand[]>([]);
    const [parameterSuggestions, setParameterSuggestions] = useState<string[]>([]);
    const [parameterName, setParameterName] = useState<string>('');
    const [isParameterMode, setIsParameterMode] = useState(false);
    const [inputKey, setInputKey] = useState(0);
    const [autocompleteHeight, setAutocompleteHeight] = useState(0);

    // Local state for autocomplete (with external override)
    const [localShowAutocomplete, _setLocalShowAutocomplete] = useState(false);
    const [localSelectedIndex, _setLocalSelectedIndex] = useState(0);

    // Use external control if provided, otherwise use local state
    const showAutocomplete = forceShowAutocomplete ?? localShowAutocomplete;
    const selectedIndex = autocompleteIndex ?? localSelectedIndex;

    // Track previous value for heuristic paste detection
    const previousValueRef = useRef(value);

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

    // Handle input changes with paste detection
    const handleChange = useCallback(
      (newValue: string) => {
        // Detect bracketed paste
        const bracketedResult = detectBracketedPaste(newValue);

        if (bracketedResult.isPaste) {
          // Bracketed paste detected
          const metadata: PasteMetadata = {
            isBracketedPaste: true,
            detectMethod: 'bracketed',
            originalLength: bracketedResult.content.length,
          };

          if (onPaste) {
            // Let onPaste handler decide what to do with the content
            // Don't also call onChange - that would duplicate the text
            onPaste(bracketedResult.content, metadata);
            return;
          }

          // No onPaste handler - update input directly
          previousValueRef.current = bracketedResult.content;
          onChange(bracketedResult.content);
          return;
        }

        // Heuristic paste detection (fallback)
        const previousValue = previousValueRef.current;
        if (detectPasteHeuristic(newValue, previousValue)) {
          const metadata: PasteMetadata = {
            isBracketedPaste: false,
            detectMethod: 'heuristic',
            originalLength: newValue.length,
          };

          if (onPaste) {
            // Let onPaste handler decide what to do with the content
            // Don't also call onChange - that would duplicate the text
            onPaste(newValue, metadata);
            return;
          }
        }

        // Update previousValueRef
        previousValueRef.current = newValue;

        // Call onChange normally (not a paste, or no onPaste handler)
        onChange(newValue);
      },
      [onChange, onPaste]
    );

    const handleSubmit = useCallback(() => {
      // If autocomplete is showing and has items, accept selection
      const itemCount = isParameterMode ? parameterSuggestions.length : filteredCommands.length;
      if (showAutocomplete && itemCount > 0) {
        acceptSelection();
      } else {
        // Submit normally
        onSubmit(undefined);
      }
    }, [
      showAutocomplete,
      isParameterMode,
      parameterSuggestions.length,
      filteredCommands.length,
      acceptSelection,
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
            focus={true}
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
