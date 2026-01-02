/**
 * Main chat interface component
 * Composes Header, MessageList, InputBox, and Footer
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Box, Text } from 'ink';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { MimirHeader } from '@/shared/ui/MimirHeader.js';
import { useKeyboard, useKeyboardAction } from '@/shared/keyboard/index.js';
import { MessageList } from '@/features/chat/components/MessageList.js';
import { InputBox } from '@/features/chat/components/InputBox.js';
import { AttachmentsArea } from '@/features/chat/components/AttachmentsArea.js';
import { Footer } from '@/shared/ui/Footer.js';
import type { Message, MessageContent } from '@codedir/mimir-agents';
import type { Message as LocalMessage } from '@/types/index.js';
import { Config } from '@/shared/config/schemas.js';
import { useTerminalSize } from '@/shared/ui/hooks/useTerminalSize.js';
import { SlashCommandRegistry } from '@/features/chat/slash-commands/SlashCommand.js';
import { AttachmentManager } from '@/features/chat/utils/AttachmentManager.js';
import type { Attachment, PasteMetadata } from '@/features/chat/types/attachment.js';
import { shouldCreateAttachment } from '@/shared/utils/bracketedPaste.js';
import { pasteLog, pasteLogContent, pasteLogSeparator } from '@/shared/utils/pasteLogger.js';

/**
 * Insert text at cursor position, handling #[n] patterns
 * If cursor is inside a #[n] pattern, insert after it
 * Adds appropriate spacing before/after the inserted text
 * Returns both the new text and the new cursor position (at end of inserted text)
 */
function insertAtCursor(
  text: string,
  cursorPos: number,
  insertText: string
): { text: string; newCursorPos: number } {
  // Check if cursor is inside a #[n] or #[x] pattern
  const refPattern = /#\[[\dx]+\]/g;
  let insideRef = false;
  let refEnd = cursorPos;

  let refMatch;
  while ((refMatch = refPattern.exec(text)) !== null) {
    const start = refMatch.index;
    const end = start + refMatch[0].length;
    if (cursorPos > start && cursorPos < end) {
      // Cursor is inside this pattern
      insideRef = true;
      refEnd = end;
      break;
    }
  }

  // If inside a #[n], insert after it
  const insertPos = insideRef ? refEnd : cursorPos;

  // Build the new string
  const before = text.slice(0, insertPos);
  const after = text.slice(insertPos);

  // Add appropriate spacing
  const needsSpaceBefore = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n');
  const needsSpaceAfter = after.length > 0 && !after.startsWith(' ') && !after.startsWith('\n');

  const spaceBefore = needsSpaceBefore ? ' ' : '';
  const spaceAfter = needsSpaceAfter ? ' ' : '';

  const newText = before + spaceBefore + insertText + spaceAfter + after;
  // Cursor goes to end of inserted text (before the spaceAfter)
  const newCursorPos = before.length + spaceBefore.length + insertText.length;

  return { text: newText, newCursorPos };
}

export interface ChatInterfaceProps {
  config: Config;
  messages: Message[];
  onUserInput: (input: MessageContent) => void;
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
  const [cursorPosition, setCursorPosition] = useState(0);
  // Token increments each time we request cursor move, so TextInput knows to update
  const [cursorRequest, setCursorRequest] = useState<{ position: number; token: number } | undefined>(undefined);
  const cursorTokenRef = useRef(0);
  const [mode, setMode] = useState<'plan' | 'act' | 'discuss'>(currentMode);
  const [interruptPressCount, setInterruptPressCount] = useState(0);
  const [isAutocompleteShowing, setIsAutocompleteShowing] = useState(false);
  const [autocompleteSelectedIndex, setAutocompleteSelectedIndex] = useState(0);
  const [autocompleteItemCount, setAutocompleteItemCount] = useState(0);

  // Attachment state
  const [attachments, setAttachments] = useState<Map<string, Attachment>>(new Map());
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);
  const attachmentManager = useRef(new AttachmentManager());
  const [manuallyClosedAutocomplete, setManuallyClosedAutocomplete] = useState(false);
  const acceptSelectionRef = useRef<(() => void) | null>(null);
  const interruptTimerRef = useRef<NodeJS.Timeout | null>(null);
  // Track last deleted attachment for "double-delete" feature (removes #[x] on quick second press)
  const lastDeleteRef = useRef<{ attachNum: string; timestamp: number } | null>(null);
  const { width: terminalWidth, height: terminalHeight } = useTerminalSize();

  // Sync mode with currentMode prop
  useEffect(() => {
    setMode(currentMode);
  }, [currentMode]);

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

  // ========== KEYBOARD EVENT BUS INTEGRATION ==========
  // Update keyboard context so the event bus knows what's happening
  const { updateContext } = useKeyboard();

  useEffect(() => {
    updateContext({
      isAutocompleteVisible: isAutocompleteShowing,
      isAgentRunning,
      isInputFocused: true,
    });
  }, [isAutocompleteShowing, isAgentRunning, updateContext]);

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

  // Accept autocomplete selection (Enter when autocomplete visible)
  useKeyboardAction(
    'accept',
    (event) => {
      if (!event.context.isAutocompleteVisible || autocompleteItemCount === 0) {
        return false; // Not handled - let Enter submit normally
      }
      if (acceptSelectionRef.current) {
        acceptSelectionRef.current();
      }
      setAutocompleteSelectedIndex(0);
      return true; // Handled
    },
    { priority: 10 }
  );

  // Show tooltip/autocomplete (Tab)
  useKeyboardAction(
    'showTooltip',
    (event) => {
      if (event.context.isAutocompleteVisible && autocompleteItemCount > 0) {
        // Autocomplete is showing - Tab should select item
        if (acceptSelectionRef.current) {
          acceptSelectionRef.current();
        }
        setAutocompleteSelectedIndex(0);
        return true;
      }
      // Not showing - show autocomplete
      setIsAutocompleteShowing(true);
      setManuallyClosedAutocomplete(false);
      setAutocompleteSelectedIndex(0);
      return true;
    },
    { priority: 0 }
  );

  // Interrupt (Ctrl+C and Escape)
  // Cascading behavior: autocomplete → text/attachments → exit
  useKeyboardAction(
    'interrupt',
    (event) => {
      // Priority 1: Close autocomplete if open
      if (event.context.isAutocompleteVisible) {
        setIsAutocompleteShowing(false);
        setManuallyClosedAutocomplete(true);
        setAutocompleteSelectedIndex(0);
        setInterruptPressCount(0); // Reset counter
        return true;
      }

      // Priority 2: Clear text input and/or attachments if present
      const hasText = input.trim().length > 0;
      const hasAttachments = attachments.size > 0;

      if (hasText || hasAttachments) {
        // Clear text input
        if (hasText) {
          setInput('');
        }
        // Clear attachments and reset counters (so next paste starts at #1)
        if (hasAttachments) {
          attachmentManager.current.clearAll();
          setAttachments(new Map());
          setSelectedAttachmentId(null);
        }
        setInterruptPressCount(0); // Reset counter
        return true;
      }

      // Priority 3: Handle exit logic (2-press to exit)
      const newCount = interruptPressCount + 1;
      setInterruptPressCount(newCount);

      if (newCount >= 2) {
        onExit();
      }
      return true;
    },
    { priority: 10 }
  );

  // Mode switch (Shift+Tab)
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
      return true;
    },
    { priority: 0 }
  );

  // Navigate attachments left (Alt+Left)
  useKeyboardAction(
    'navigateLeft',
    (event) => {
      if (event.context.isAutocompleteVisible || attachments.size === 0) {
        return false;
      }
      const list = Array.from(attachments.values()).sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      );
      const currentIdx = selectedAttachmentId
        ? list.findIndex((a) => a.id === selectedAttachmentId)
        : 0;
      const newIdx = currentIdx > 0 ? currentIdx - 1 : list.length - 1;
      setSelectedAttachmentId(list[newIdx]?.id || null);
      return true;
    },
    { priority: 5 }
  );

  // Navigate attachments right (Alt+Right)
  useKeyboardAction(
    'navigateRight',
    (event) => {
      if (event.context.isAutocompleteVisible || attachments.size === 0) {
        return false;
      }
      const list = Array.from(attachments.values()).sort(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
      );
      const currentIdx = selectedAttachmentId
        ? list.findIndex((a) => a.id === selectedAttachmentId)
        : -1;
      const newIdx = currentIdx < list.length - 1 ? currentIdx + 1 : 0;
      setSelectedAttachmentId(list[newIdx]?.id || null);
      return true;
    },
    { priority: 5 }
  );

  // Remove selected attachment (Ctrl+Shift+Backspace)
  // Double-delete: If pressed quickly after deleting, also removes the #[x] markers
  useKeyboardAction(
    'removeAttachment',
    (event) => {
      if (event.context.isAutocompleteVisible) {
        return false;
      }

      // Check for double-delete FIRST (before checking selected attachment)
      // This handles the case where after deletion, another attachment gets selected
      const lastDelete = lastDeleteRef.current;
      const now = Date.now();
      // Double-delete within 300ms removes the #[x] that was just created
      if (lastDelete && now - lastDelete.timestamp < 300) {
        setInput((prev) => {
          // Remove the #[x] markers and clean up whitespace
          return prev.replace(/#\[x\]/g, '').replace(/\s{2,}/g, ' ').trim();
        });
        lastDeleteRef.current = null; // Clear so triple-delete doesn't do anything
        return true;
      }

      // Normal delete: remove selected attachment
      if (!selectedAttachmentId) {
        return false;
      }

      handleRemoveAttachment(selectedAttachmentId);
      return true;
    },
    { priority: 10 }
  );

  // Insert selected attachment reference into input at cursor position (Ctrl+R)
  useKeyboardAction(
    'insertAttachmentRef',
    (event) => {
      if (event.context.isAutocompleteVisible || !selectedAttachmentId) {
        return false;
      }
      // Find the attachment and get its number
      const attachment = attachments.get(selectedAttachmentId);
      if (!attachment) return false;

      const match = attachment.label.match(/#(\d+)/);
      const attachNum = match ? match[1] : '1';
      const ref = `#[${attachNum}]`;

      // Insert reference at cursor position and move cursor to end of ref
      const result = insertAtCursor(input, cursorPosition, ref);
      setInput(result.text);
      // Request cursor to move to end of inserted ref
      cursorTokenRef.current++;
      setCursorRequest({ position: result.newCursorPos, token: cursorTokenRef.current });
      return true;
    },
    { priority: 10 }
  );

  // Open selected attachment in external editor/viewer (Ctrl+O)
  useKeyboardAction(
    'openAttachment',
    (event) => {
      if (event.context.isAutocompleteVisible || !selectedAttachmentId) {
        return false;
      }
      const attachment = attachments.get(selectedAttachmentId);
      if (!attachment) return false;

      // Open attachment based on type
      if (attachment.type === 'text') {
        // Try to open in $EDITOR
        const editor = process.env.EDITOR || process.env.VISUAL;
        if (editor && typeof attachment.content === 'string') {
          // Write content to temp file
          const tempDir = os.tmpdir();
          const tempFile = path.join(tempDir, `mimir-attachment-${Date.now()}.txt`);
          try {
            fs.writeFileSync(tempFile, attachment.content, 'utf8');
            // Spawn editor
            const child = spawn(editor, [tempFile], {
              stdio: 'inherit',
              shell: true,
              detached: false,
            });
            child.on('error', (err) => {
              // Silently handle errors - editor may not be available
              void err;
            });
          } catch {
            // Failed to write or spawn - silently fail
          }
        }
      } else if (attachment.type === 'image') {
        // Try to open with system image viewer
        const buffer = attachment.content instanceof Buffer
          ? attachment.content
          : Buffer.from(attachment.content as string, 'utf8');
        const tempDir = os.tmpdir();
        const format = attachment.metadata.format || 'png';
        const tempFile = path.join(tempDir, `mimir-image-${Date.now()}.${format}`);
        try {
          fs.writeFileSync(tempFile, buffer);
          // Open with system viewer
          const platform = os.platform();
          let cmd: string;
          let args: string[];
          if (platform === 'darwin') {
            cmd = 'open';
            args = [tempFile];
          } else if (platform === 'win32') {
            cmd = 'cmd';
            args = ['/c', 'start', '', tempFile];
          } else {
            cmd = 'xdg-open';
            args = [tempFile];
          }
          const child = spawn(cmd, args, {
            stdio: 'ignore',
            shell: false,
            detached: true,
          });
          child.unref();
          child.on('error', () => { /* ignore */ });
        } catch {
          // Failed to write or spawn - silently fail
        }
      }
      return true;
    },
    { priority: 10 }
  );

  // Handle paste events from InputBox
  const handlePaste = useCallback(
    (content: string, metadata: PasteMetadata) => {
      // FIRST LINE - log immediately to catch any early failures
      try {
        pasteLog('ChatInterface', '>>> handlePaste ENTRY <<<', { contentLen: content.length });
      } catch (e) { /* ignore */ }

      pasteLogSeparator('ChatInterface.handlePaste');
      const lines = content.split('\n').length;
      pasteLog('ChatInterface', 'handlePaste called', {
        contentLen: content.length,
        lines,
        metadata: JSON.stringify(metadata),
        currentInput: input,
      });
      pasteLogContent('ChatInterface-CONTENT', content);

      const shouldAttach = shouldCreateAttachment(content);
      pasteLog('ChatInterface', 'shouldCreateAttachment result', {
        shouldAttach,
        lines,
        threshold: '>5 lines',
      });

      if (shouldAttach) {
        // Create attachment for large pastes
        pasteLog('ChatInterface', 'Creating attachment');
        const attachment = attachmentManager.current.addTextAttachment(content, metadata);
        const allAttachments = attachmentManager.current.getAll();
        setAttachments(new Map(allAttachments.map((a) => [a.id, a])));

        // Extract attachment number from label (e.g., "[#1 - Pasted text]" -> 1)
        const match = attachment.label.match(/#(\d+)/);
        const attachNum = match ? match[1] : '1';

        // Insert reference at cursor position and move cursor to end of ref
        const ref = `#[${attachNum}]`;
        pasteLog('ChatInterface', 'Inserting reference at cursor', { ref, cursorPosition });
        const result = insertAtCursor(input, cursorPosition, ref);
        setInput(result.text);
        // Request cursor to move to end of inserted ref
        cursorTokenRef.current++;
        setCursorRequest({ position: result.newCursorPos, token: cursorTokenRef.current });

        // Auto-select the new attachment
        setSelectedAttachmentId(attachment.id);
        pasteLog('ChatInterface', 'Attachment created', {
          id: attachment.id,
          label: attachment.label,
        });
      } else {
        // Insert pasted content at cursor position (for small pastes)
        pasteLog('ChatInterface', 'Inserting content inline at cursor', { cursorPosition });
        const result = insertAtCursor(input, cursorPosition, content);
        setInput(result.text);
        // Request cursor to move to end of inserted content
        cursorTokenRef.current++;
        setCursorRequest({ position: result.newCursorPos, token: cursorTokenRef.current });
      }
      pasteLog('ChatInterface', 'handlePaste complete');
    },
    [input, cursorPosition]
  );

  // Handle attachment removal - marks references as invalid #[x] and selects previous
  const handleRemoveAttachment = useCallback((id: string) => {
    // Get the attachment number and list index before removing
    const attachment = attachmentManager.current.get(id);
    const attachNum = attachment ? AttachmentManager.getAttachmentNumber(attachment.label) : null;

    // Get sorted list to find previous attachment
    const sortedList = attachmentManager.current.getAll();
    const removedIndex = sortedList.findIndex((a) => a.id === id);

    // Remove from attachment manager
    attachmentManager.current.remove(id);
    const allAttachments = attachmentManager.current.getAll();
    setAttachments(new Map(allAttachments.map((a) => [a.id, a])));

    // Reset counters when all attachments are removed (so next paste starts at #1)
    if (allAttachments.length === 0) {
      attachmentManager.current.resetCounters();
    }

    // Replace references to this attachment with #[x] (invalid marker)
    if (attachNum) {
      setInput((prev) => {
        // Replace #[n] with #[x] to mark as invalid/deleted
        const pattern = new RegExp(`#\\[${attachNum}\\]`, 'g');
        return prev.replace(pattern, '#[x]');
      });
      // Track this deletion for double-delete feature (quick second press removes #[x])
      lastDeleteRef.current = { attachNum, timestamp: Date.now() };
    }

    // Select previous attachment if the removed one was selected
    if (selectedAttachmentId === id) {
      if (removedIndex > 0 && allAttachments.length > 0) {
        // Select previous attachment (index - 1 in original list, but list is now shorter)
        const prevAttachment = allAttachments[Math.min(removedIndex - 1, allAttachments.length - 1)];
        setSelectedAttachmentId(prevAttachment?.id || null);
      } else if (allAttachments.length > 0) {
        // Removed first item, select new first item
        setSelectedAttachmentId(allAttachments[0]?.id || null);
      } else {
        // No attachments left
        setSelectedAttachmentId(null);
      }
    }
  }, [selectedAttachmentId]);

  // Memoize submit handler to prevent InputBox from re-rendering unnecessarily
  // Accepts optional value parameter from autocomplete to avoid stale state issues
  const handleSubmit = useCallback(
    (value?: string) => {
      const submittedValue = value !== undefined ? value : input;
      if (submittedValue.trim() || attachments.size > 0) {
        // Find which attachments are referenced in the input (e.g., #[1], #[2])
        const referencedNums = new Set<string>();
        const refPattern = /#\[(\d+)\]/g;
        let match;
        while ((match = refPattern.exec(submittedValue)) !== null) {
          referencedNums.add(match[1]!);
        }

        // Expand only referenced attachments for API (multi-part message)
        const messageContent: MessageContent =
          attachments.size > 0 && referencedNums.size > 0
            ? attachmentManager.current.expandForAPI(submittedValue, referencedNums)
            : submittedValue;

        onUserInput(messageContent);

        setInput('');

        // Clear attachments
        attachmentManager.current.clear();
        setAttachments(new Map());
        setSelectedAttachmentId(null);
      }
    },
    [input, onUserInput, attachments]
  );

  // Memoize divider content - only recalculate when width changes
  const dividerContent = useMemo(() => '─'.repeat(dividerWidth), [dividerWidth]);

  // Create context for slash command parameter autocomplete
  const commandContext = useMemo(
    () => ({
      currentMode: mode,
      currentProvider: config.llm.provider,
      currentModel: config.llm.model ?? 'unknown',
      messageCount: messages.length,
    }),
    [mode, config.llm.provider, config.llm.model, messages.length]
  );

  // Compute set of valid attachment numbers for input validation
  const validAttachmentNums = useMemo(() => {
    const nums = new Set<string>();
    for (const attachment of attachments.values()) {
      const num = AttachmentManager.getAttachmentNumber(attachment.label);
      if (num) {
        nums.add(num);
      }
    }
    return nums;
  }, [attachments]);

  // Layout structure (from top to bottom):
  // MimirHeader (4) + Divider (1) + MessageList (flex) + Divider (1) + InputBox + Divider (1) + Footer (1)
  // InputBox contains: Input (1) + Autocomplete (0-N when visible)
  //
  // Fixed UI lines: Header (4) + Divider (1) + Divider (1) + Input (1) + Divider (1) + Footer (1) = 9
  // Variable: MessageList + Autocomplete

  const fixedUIHeight = 9;
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

  // Calculate attachments area height
  // Structure: Header (1) + Items (N, max 3 visible) + Footer (1) + scroll indicators (0-2)
  const attachmentsHeight =
    attachments.size > 0
      ? Math.min(attachments.size * 2 + 3, 11) // Header + items (2 lines each) + footer, max 11 lines
      : 0;

  const messageAreaHeight = Math.max(
    minMessageLines,
    terminalHeight - fixedUIHeight - estimatedAutocompleteHeight - attachmentsHeight
  );

  return (
    <Box flexDirection="column" height={terminalHeight}>
      {/* Fixed header */}
      <MimirHeader
        version={version}
        provider={config.llm.provider}
        model={config.llm.model ?? 'unknown'}
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
          messages={messages as unknown as LocalMessage[]}
          theme={config.ui.theme}
          syntaxHighlighting={config.ui.syntaxHighlighting}
        />
      </Box>

      {/* Divider above input */}
      <Box>
        <Text dimColor>{dividerContent}</Text>
      </Box>

      {/* Fixed bottom section: Input + Autocomplete (below input) + Attachments + Footer */}
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
        bracketedPasteEnabled={true}
        onPaste={handlePaste}
        onCursorChange={setCursorPosition}
        validAttachmentNums={validAttachmentNums}
        requestCursorAt={cursorRequest}
      />

      {/* Attachments area - appears below InputBox when attachments present */}
      {attachments.size > 0 && (
        <AttachmentsArea
          attachments={attachments}
          selectedAttachmentId={selectedAttachmentId}
          theme={config.ui.theme}
          keyBindings={config.keyBindings}
          provider={config.llm.provider}
          model={config.llm.model}
          onRemove={handleRemoveAttachment}
          currentInput={input}
        />
      )}

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
