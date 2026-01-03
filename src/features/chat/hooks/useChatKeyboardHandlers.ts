/**
 * Custom hook for chat keyboard action handlers
 * Extracts keyboard handling logic from ChatInterface
 */

import { useCallback } from 'react';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { useKeyboardAction } from '@/shared/keyboard/index.js';
import type { Attachment } from '@/features/chat/types/attachment.js';
import { logger } from '@/shared/utils/logger.js';

type ChatMode = 'plan' | 'act' | 'discuss';

interface KeyboardHandlersConfig {
  autocompleteItemCount: number;
  setAutocompleteSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  acceptSelectionRef: React.MutableRefObject<(() => void) | null>;
  setIsAutocompleteShowing: React.Dispatch<React.SetStateAction<boolean>>;
  setManuallyClosedAutocomplete: React.Dispatch<React.SetStateAction<boolean>>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  attachments: Map<string, Attachment>;
  clearAttachments: () => void;
  interruptPressCount: number;
  setInterruptPressCount: React.Dispatch<React.SetStateAction<number>>;
  onExit: () => void;
  mode: ChatMode;
  setMode: React.Dispatch<React.SetStateAction<ChatMode>>;
  onModeSwitch?: (mode: ChatMode) => void;
  selectedAttachmentId: string | null;
  setSelectedAttachmentId: React.Dispatch<React.SetStateAction<string | null>>;
  handleRemoveAttachment: (id: string) => void;
  cursorPosition: number;
  setCursorRequest: React.Dispatch<
    React.SetStateAction<{ position: number; token: number } | undefined>
  >;
  cursorTokenRef: React.MutableRefObject<number>;
  lastDeleteRef: React.MutableRefObject<{ attachNum: string; timestamp: number } | null>;
  insertAtCursor: (
    text: string,
    cursorPos: number,
    insertText: string
  ) => { text: string; newCursorPos: number };
}

/**
 * Opens a text attachment in the configured editor
 */
function openTextInEditor(content: string): void {
  const editor = process.env.EDITOR || process.env.VISUAL;
  if (!editor || typeof content !== 'string') return;

  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `mimir-attachment-${Date.now()}.txt`);
  try {
    fs.writeFileSync(tempFile, content, 'utf8');
    // eslint-disable-next-line sonarjs/os-command
    const child = spawn(editor, [tempFile], {
      stdio: 'inherit',
      shell: true,
      detached: false,
    });
    child.on('error', (err) => {
      logger.debug('Failed to open editor', { error: err.message });
    });
  } catch {
    // Failed to write or spawn - silently fail
  }
}

/**
 * Opens an image attachment with the system viewer
 */
function openImageInViewer(attachment: Attachment): void {
  const buffer =
    attachment.content instanceof Buffer
      ? attachment.content
      : Buffer.from(attachment.content as string, 'utf8');
  const tempDir = os.tmpdir();
  const format = attachment.metadata.format || 'png';
  const tempFile = path.join(tempDir, `mimir-image-${Date.now()}.${format}`);
  try {
    fs.writeFileSync(tempFile, buffer);
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
    child.on('error', () => {
      /* ignore */
    });
  } catch {
    // Failed to write or spawn - silently fail
  }
}

export function useChatKeyboardHandlers(config: KeyboardHandlersConfig): void {
  const {
    autocompleteItemCount,
    setAutocompleteSelectedIndex,
    acceptSelectionRef,
    setIsAutocompleteShowing,
    setManuallyClosedAutocomplete,
    input,
    setInput,
    attachments,
    clearAttachments,
    interruptPressCount,
    setInterruptPressCount,
    onExit,
    mode,
    setMode,
    onModeSwitch,
    selectedAttachmentId,
    setSelectedAttachmentId,
    handleRemoveAttachment,
    cursorPosition,
    setCursorRequest,
    cursorTokenRef,
    lastDeleteRef,
    insertAtCursor,
  } = config;

  // Navigate up in autocomplete
  useKeyboardAction(
    'navigateUp',
    (event) => {
      if (!event.context.isAutocompleteVisible || autocompleteItemCount === 0) {
        return false;
      }
      setAutocompleteSelectedIndex((prev) => (prev > 0 ? prev - 1 : autocompleteItemCount - 1));
      return true;
    },
    { priority: 10 }
  );

  // Navigate down in autocomplete
  useKeyboardAction(
    'navigateDown',
    (event) => {
      if (!event.context.isAutocompleteVisible || autocompleteItemCount === 0) {
        return false;
      }
      setAutocompleteSelectedIndex((prev) => (prev < autocompleteItemCount - 1 ? prev + 1 : 0));
      return true;
    },
    { priority: 10 }
  );

  // Accept autocomplete selection
  useKeyboardAction(
    'accept',
    (event) => {
      if (!event.context.isAutocompleteVisible || autocompleteItemCount === 0) {
        return false;
      }
      if (acceptSelectionRef.current) {
        acceptSelectionRef.current();
      }
      setAutocompleteSelectedIndex(0);
      return true;
    },
    { priority: 10 }
  );

  // Show tooltip/autocomplete
  useKeyboardAction(
    'showTooltip',
    (event) => {
      if (event.context.isAutocompleteVisible && autocompleteItemCount > 0) {
        if (acceptSelectionRef.current) {
          acceptSelectionRef.current();
        }
        setAutocompleteSelectedIndex(0);
      } else {
        setIsAutocompleteShowing(true);
        setManuallyClosedAutocomplete(false);
        setAutocompleteSelectedIndex(0);
      }
      return true;
    },
    { priority: 0 }
  );

  // Interrupt handler
  useKeyboardAction(
    'interrupt',
    (event) => {
      if (event.context.isAutocompleteVisible) {
        setIsAutocompleteShowing(false);
        setManuallyClosedAutocomplete(true);
        setAutocompleteSelectedIndex(0);
        setInterruptPressCount(0);
      } else {
        const hasText = input.trim().length > 0;
        const hasAttachments = attachments.size > 0;

        if (hasText || hasAttachments) {
          if (hasText) setInput('');
          if (hasAttachments) clearAttachments();
          setInterruptPressCount(0);
        } else {
          const newCount = interruptPressCount + 1;
          setInterruptPressCount(newCount);
          if (newCount >= 2) onExit();
        }
      }
      return true;
    },
    { priority: 10 }
  );

  // Mode switch
  useKeyboardAction(
    'modeSwitch',
    (event) => {
      if (event.context.isAutocompleteVisible) return false;
      const modes: ChatMode[] = ['plan', 'act', 'discuss'];
      const currentIndex = modes.indexOf(mode);
      const nextIndex = (currentIndex + 1) % modes.length;
      const nextMode = modes[nextIndex];
      if (nextMode) {
        setMode(nextMode);
        if (onModeSwitch) onModeSwitch(nextMode);
      }
      return true;
    },
    { priority: 0 }
  );

  // Helper for attachment list sorting
  const getSortedAttachmentList = useCallback(() => {
    return Array.from(attachments.values()).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
    );
  }, [attachments]);

  // Navigate attachments left
  useKeyboardAction(
    'navigateLeft',
    (event) => {
      if (event.context.isAutocompleteVisible || attachments.size === 0) return false;
      const list = getSortedAttachmentList();
      const currentIdx = selectedAttachmentId
        ? list.findIndex((a) => a.id === selectedAttachmentId)
        : 0;
      const newIdx = currentIdx > 0 ? currentIdx - 1 : list.length - 1;
      setSelectedAttachmentId(list[newIdx]?.id || null);
      return true;
    },
    { priority: 5 }
  );

  // Navigate attachments right
  useKeyboardAction(
    'navigateRight',
    (event) => {
      if (event.context.isAutocompleteVisible || attachments.size === 0) return false;
      const list = getSortedAttachmentList();
      const currentIdx = selectedAttachmentId
        ? list.findIndex((a) => a.id === selectedAttachmentId)
        : -1;
      const newIdx = currentIdx < list.length - 1 ? currentIdx + 1 : 0;
      setSelectedAttachmentId(list[newIdx]?.id || null);
      return true;
    },
    { priority: 5 }
  );

  // Remove attachment with double-delete support
  useKeyboardAction(
    'removeAttachment',
    (event) => {
      if (event.context.isAutocompleteVisible) return false;

      const lastDelete = lastDeleteRef.current;
      const now = Date.now();
      if (lastDelete && now - lastDelete.timestamp < 300) {
        setInput((prev) =>
          prev
            .replace(/#\[x\]/g, '')
            .replace(/\s{2,}/g, ' ')
            .trim()
        );
        lastDeleteRef.current = null;
        return true;
      }

      if (!selectedAttachmentId) return false;
      handleRemoveAttachment(selectedAttachmentId);
      return true;
    },
    { priority: 10 }
  );

  // Insert attachment reference
  useKeyboardAction(
    'insertAttachmentRef',
    (event) => {
      if (event.context.isAutocompleteVisible || !selectedAttachmentId) return false;
      const attachment = attachments.get(selectedAttachmentId);
      if (!attachment) return false;

      const labelPattern = /#(\d+)/;
      const match = labelPattern.exec(attachment.label);
      const attachNum = match ? match[1] : '1';
      const ref = `#[${attachNum}]`;

      const result = insertAtCursor(input, cursorPosition, ref);
      setInput(result.text);
      cursorTokenRef.current++;
      setCursorRequest({ position: result.newCursorPos, token: cursorTokenRef.current });
      return true;
    },
    { priority: 10 }
  );

  // Open attachment
  useKeyboardAction(
    'openAttachment',
    (event) => {
      if (event.context.isAutocompleteVisible || !selectedAttachmentId) return false;
      const attachment = attachments.get(selectedAttachmentId);
      if (!attachment) return false;

      if (attachment.type === 'text') {
        openTextInEditor(attachment.content as string);
      } else if (attachment.type === 'image') {
        openImageInViewer(attachment);
      }
      return true;
    },
    { priority: 10 }
  );
}
