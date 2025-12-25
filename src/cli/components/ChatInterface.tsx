/**
 * Main chat interface component
 * Composes Header, MessageList, InputBox, and Footer
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Box, Text } from 'ink';
import { MimirHeader } from './MimirHeader.js';
import { MessageList } from './MessageList.js';
import { InputBox } from './InputBox.js';
import { Footer } from './Footer.js';
import { Message } from '../../types/index.js';
import { Config } from '../../config/schemas.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { SlashCommandRegistry } from '../../core/SlashCommand.js';
import { useKeyboard, useKeyboardAction } from '../keyboard/index.js';

export interface ChatInterfaceProps {
  config: Config;
  messages: Message[];
  onUserInput: (input: string) => void;
  onExit: () => void;
  currentMode: 'plan' | 'act' | 'discuss';
  onModeSwitch?: (mode: 'plan' | 'act' | 'discuss') => void;
  totalCost: number;
  version?: string;
  workspace?: string;
  isAgentRunning?: boolean;
  commandRegistry?: SlashCommandRegistry;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  config,
  messages,
  onUserInput,
  onExit,
  currentMode,
  onModeSwitch,
  totalCost,
  version = '0.1.0',
  workspace = process.cwd(),
  isAgentRunning = false,
  commandRegistry,
}) => {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'plan' | 'act' | 'discuss'>(currentMode);
  const [interruptPressCount, setInterruptPressCount] = useState(0);
  const [isAutocompleteShowing, setIsAutocompleteShowing] = useState(false);
  const [autocompleteSelectedIndex, setAutocompleteSelectedIndex] = useState(0);
  const [autocompleteItemCount, setAutocompleteItemCount] = useState(0);
  const [manuallyClosedAutocomplete, setManuallyClosedAutocomplete] = useState(false);
  const acceptSelectionRef = useRef<(() => void) | null>(null);
  const interruptTimerRef = useRef<NodeJS.Timeout | null>(null);
  const { width: terminalWidth, height: terminalHeight } = useTerminalSize();
  const { updateContext } = useKeyboard();

  // Sync mode with currentMode prop
  useEffect(() => {
    setMode(currentMode);
  }, [currentMode]);

  // Update keyboard context when state changes
  useEffect(() => {
    updateContext({
      isAutocompleteVisible: isAutocompleteShowing,
      isAgentRunning,
      isInputFocused: true,
    });
  }, [isAutocompleteShowing, isAgentRunning, updateContext]);

  // Memoize divider width - only recalculate when terminal width changes
  // This ensures Ink only updates the divider line on resize, not entire UI
  const dividerWidth = useMemo(() => {
    return Math.max(1, terminalWidth);
  }, [terminalWidth]);

  // Reset interrupt count after 2 seconds of no interrupt presses
  useEffect(() => {
    if (interruptPressCount > 0) {
      if (interruptTimerRef.current) {
        clearTimeout(interruptTimerRef.current);
      }
      interruptTimerRef.current = setTimeout(() => {
        setInterruptPressCount(0);
      }, 2000);
    }
    return () => {
      if (interruptTimerRef.current) {
        clearTimeout(interruptTimerRef.current);
      }
    };
  }, [interruptPressCount]);

  // Track actual autocomplete height for dynamic message area sizing
  const [actualAutocompleteHeight, setActualAutocompleteHeight] = useState(0);

  // Auto-show autocomplete when suggestions available (unless manually closed)
  const handleAutocompleteStateChange = useCallback(
    (state: {
      itemCount: number;
      isParameterMode: boolean;
      shouldShow: boolean;
      actualHeight?: number;
    }) => {
      setAutocompleteItemCount(state.itemCount);

      // Update actual height if provided
      if (state.actualHeight !== undefined) {
        setActualAutocompleteHeight(state.actualHeight);
      }

      // Auto-show autocomplete if:
      // 1. Config flag is enabled (autocompleteAutoShow)
      // 2. Should show (has suggestions)
      // 3. User hasn't manually closed it
      // 4. Item count > 0
      if (
        config.ui.autocompleteAutoShow &&
        state.shouldShow &&
        !manuallyClosedAutocomplete &&
        state.itemCount > 0
      ) {
        setIsAutocompleteShowing((prev) => {
          // Only reset selected index when first showing autocomplete
          if (!prev) {
            setAutocompleteSelectedIndex(0);
          }
          return true;
        });
      } else if (!state.shouldShow) {
        // Hide if no suggestions
        setIsAutocompleteShowing(false);
        setActualAutocompleteHeight(0);
      }
    },
    [manuallyClosedAutocomplete, config.ui.autocompleteAutoShow]
  );

  // Reset manual close flag when input changes
  const handleInputChange = useCallback((newValue: string) => {
    setInput(newValue);
    // Reset manual close flag to allow autocomplete to show again
    setManuallyClosedAutocomplete(false);
    // Reset selected index when typing (not when navigating)
    setAutocompleteSelectedIndex(0);
  }, []);

  // KEYBOARD ACTIONS - Using centralized keyboard system

  // Navigate up in autocomplete (priority: 10 - child handler)
  useKeyboardAction(
    'navigateUp',
    (event) => {
      if (!event.context.isAutocompleteVisible || autocompleteItemCount === 0) {
        return false; // Not handled, let others try
      }

      setAutocompleteSelectedIndex((prev) => (prev > 0 ? prev - 1 : autocompleteItemCount - 1));
      return true; // Handled, stop propagation
    },
    { priority: 10 }
  );

  // Navigate down in autocomplete (priority: 10 - child handler)
  useKeyboardAction(
    'navigateDown',
    (event) => {
      if (!event.context.isAutocompleteVisible || autocompleteItemCount === 0) {
        return false; // Not handled
      }

      setAutocompleteSelectedIndex((prev) => (prev < autocompleteItemCount - 1 ? prev + 1 : 0));
      return true; // Handled
    },
    { priority: 10 }
  );

  // Accept autocomplete selection (Tab/Enter) (priority: 10 - child handler)
  useKeyboardAction(
    'accept',
    (event) => {
      if (!event.context.isAutocompleteVisible || autocompleteItemCount === 0) {
        return false; // Not handled
      }

      if (acceptSelectionRef.current) {
        acceptSelectionRef.current();
      }
      setAutocompleteSelectedIndex(0);
      return true; // Handled
    },
    { priority: 10 }
  );

  // Show tooltip/autocomplete (Tab/Ctrl+Space) (priority: 0 - normal handler)
  useKeyboardAction(
    'showTooltip',
    (event) => {
      if (event.context.isAutocompleteVisible && autocompleteItemCount > 0) {
        // Autocomplete is showing - Tab should select item (same as Enter)
        if (acceptSelectionRef.current) {
          acceptSelectionRef.current();
        }
        setAutocompleteSelectedIndex(0);
        return true; // Handled
      }

      // Not showing or no items - show autocomplete
      setIsAutocompleteShowing(true);
      setManuallyClosedAutocomplete(false);
      setAutocompleteSelectedIndex(0);
      return true; // Handled
    },
    { priority: 0 }
  );

  // Interrupt (Ctrl+C and Escape) - Shared logic for both keys
  // Priority 10 ensures autocomplete close is handled before exit
  useKeyboardAction(
    'interrupt',
    (event) => {
      // If autocomplete showing, close it first (priority handling)
      if (event.context.isAutocompleteVisible) {
        setIsAutocompleteShowing(false);
        setManuallyClosedAutocomplete(true);
        setAutocompleteSelectedIndex(0);
        return true; // Handled, don't exit app
      }

      // Handle interrupt/exit logic
      const newCount = interruptPressCount + 1;
      setInterruptPressCount(newCount);

      if (event.context.isAgentRunning) {
        if (newCount === 1) {
          // First press: interrupt agent (TODO: implement agent interruption)
          // For now, just count it
        } else if (newCount >= 2) {
          // Second press: exit
          onExit();
        }
      } else {
        if (newCount >= 2) {
          // Not running and second press: exit
          onExit();
        }
      }

      return true; // Handled
    },
    { priority: 10 }
  );

  // Mode switch (Shift+Tab) (priority: 0 - normal handler)
  useKeyboardAction(
    'modeSwitch',
    (event) => {
      if (event.context.isAutocompleteVisible) {
        return false; // Don't switch modes while autocomplete showing
      }

      const modes: Array<'plan' | 'act' | 'discuss'> = ['plan', 'act', 'discuss'];
      const currentIndex = modes.indexOf(mode);
      const nextIndex = (currentIndex + 1) % modes.length;
      const nextMode = modes[nextIndex];
      if (nextMode) {
        setMode(nextMode);
        if (onModeSwitch) {
          onModeSwitch(nextMode);
        }
      }
      return true; // Handled
    },
    { priority: 0 }
  );

  // Memoize submit handler to prevent InputBox from re-rendering unnecessarily
  // Accepts optional value parameter from autocomplete to avoid stale state issues
  const handleSubmit = useCallback(
    (value?: string) => {
      const submittedValue = value !== undefined ? value : input;
      if (submittedValue.trim()) {
        onUserInput(submittedValue);
        setInput('');
      }
    },
    [input, onUserInput]
  );

  // Memoize divider content - only recalculate when width changes
  const dividerContent = useMemo(() => '─'.repeat(dividerWidth), [dividerWidth]);

  // Create context for slash command parameter autocomplete
  const commandContext = useMemo(
    () => ({
      currentMode: mode,
      currentProvider: config.llm.provider,
      currentModel: config.llm.model,
      messageCount: messages.length,
    }),
    [mode, config.llm.provider, config.llm.model, messages.length]
  );

  // Layout structure (from top to bottom):
  // MimirHeader (4) + Divider (1) + MessageList (flex) + InputBox + Divider (1) + Footer (1)
  // InputBox contains: Input (1) + Autocomplete (0-N when visible)
  //
  // Fixed UI lines: Header (4) + Divider (1) + Input (1) + Divider (1) + Footer (1) = 8
  // Variable: MessageList + Autocomplete

  const fixedUIHeight = 8;
  const minMessageLines = 3;

  // Calculate space for autocomplete dynamically:
  // Total available = terminalHeight - fixedUI - minMessages
  // Autocomplete structure: Header (1) + moreAbove (0-1) + items (N) + moreBelow (0-1) + Footer (1)
  const autocompleteOverhead = 4; // header + footer + max 2 pagination indicators
  const availableForAutocomplete = terminalHeight - fixedUIHeight - minMessageLines;
  const availableForAutocompleteItems = Math.max(
    0,
    availableForAutocomplete - autocompleteOverhead
  );

  // maxVisible clamped between 5-10 items
  const maxVisibleItems = Math.max(5, Math.min(10, availableForAutocompleteItems));

  // Use actualAutocompleteHeight if available, otherwise reserve space based on maxVisibleItems
  // This prevents overflow during the initial render before height is calculated
  // Add generous buffer for potential parameter tooltips (worst case: up to 12 extra lines for params + padding)
  const parameterTooltipBuffer = 12;
  const estimatedAutocompleteHeight = isAutocompleteShowing
    ? actualAutocompleteHeight || maxVisibleItems + autocompleteOverhead + parameterTooltipBuffer
    : 0;

  const messageAreaHeight = Math.max(
    minMessageLines,
    terminalHeight - fixedUIHeight - estimatedAutocompleteHeight
  );

  return (
    <Box flexDirection="column" height={terminalHeight}>
      {/* Fixed header */}
      <MimirHeader
        version={version}
        provider={config.llm.provider}
        model={config.llm.model}
        workspace={workspace}
        theme={config.ui.theme}
        mode={mode}
      />

      <Box>
        <Text dimColor>{dividerContent}</Text>
      </Box>

      {/* Scrollable message area - shrinks when autocomplete appears */}
      <Box height={messageAreaHeight}>
        <MessageList
          messages={messages}
          theme={config.ui.theme}
          syntaxHighlighting={config.ui.syntaxHighlighting}
        />
      </Box>

      {/* Fixed bottom section: Input + Autocomplete (below input) + Footer */}
      {/* Autocomplete grows downward from input when visible, pushing footer down */}
      <InputBox
        value={input}
        onChange={handleInputChange}
        onSubmit={handleSubmit}
        theme={config.ui.theme}
        commandRegistry={commandRegistry}
        context={commandContext}
        onAutocompleteChange={setIsAutocompleteShowing}
        forceShowAutocomplete={isAutocompleteShowing}
        onAutocompleteStateChange={handleAutocompleteStateChange}
        autocompleteIndex={autocompleteSelectedIndex}
        onAcceptSelectionRef={acceptSelectionRef}
        maxVisible={maxVisibleItems}
        keyBindings={config.keyBindings}
        autocompleteExecuteOnSelect={config.ui.autocompleteExecuteOnSelect}
      />

      <Box>
        <Text dimColor>{dividerContent}</Text>
      </Box>

      <Footer
        theme={config.ui.theme}
        shortcuts={config.keyBindings}
        mode={mode}
        cost={totalCost}
        interruptPressCount={interruptPressCount}
        isAgentRunning={isAgentRunning}
      />
    </Box>
  );
};
