/**
 * Custom hook for attachment state management
 * Extracts attachment handling logic from ChatInterface
 */

import { useState, useRef, useCallback } from 'react';
import { AttachmentManager } from '@/features/chat/utils/AttachmentManager.js';
import type { Attachment, PasteMetadata } from '@/features/chat/types/attachment.js';
import { shouldCreateAttachment } from '@/shared/utils/bracketedPaste.js';
import { pasteLog, pasteLogContent, pasteLogSeparator } from '@/shared/utils/pasteLogger.js';

interface InsertAtCursorFn {
  (text: string, cursorPos: number, insertText: string): { text: string; newCursorPos: number };
}

/** Parameters for handlePaste grouped to reduce function parameter count */
export interface HandlePasteOptions {
  content: string;
  metadata: PasteMetadata;
  input: string;
  cursorPosition: number;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  setCursorRequest: React.Dispatch<
    React.SetStateAction<{ position: number; token: number } | undefined>
  >;
  cursorTokenRef: React.MutableRefObject<number>;
  insertAtCursor: InsertAtCursorFn;
}

interface UseAttachmentStateResult {
  attachments: Map<string, Attachment>;
  selectedAttachmentId: string | null;
  setSelectedAttachmentId: React.Dispatch<React.SetStateAction<string | null>>;
  attachmentManager: React.MutableRefObject<AttachmentManager>;
  lastDeleteRef: React.MutableRefObject<{ attachNum: string; timestamp: number } | null>;
  handlePaste: (options: HandlePasteOptions) => void;
  handleRemoveAttachment: (
    id: string,
    setInput: React.Dispatch<React.SetStateAction<string>>
  ) => void;
  clearAttachments: () => void;
  setAttachments: React.Dispatch<React.SetStateAction<Map<string, Attachment>>>;
}

export function useAttachmentState(): UseAttachmentStateResult {
  const [attachments, setAttachments] = useState<Map<string, Attachment>>(new Map());
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);
  const attachmentManager = useRef(new AttachmentManager());
  const lastDeleteRef = useRef<{ attachNum: string; timestamp: number } | null>(null);

  const handlePaste = useCallback(
    ({
      content,
      metadata,
      input,
      cursorPosition,
      setInput,
      setCursorRequest,
      cursorTokenRef,
      insertAtCursor,
    }: HandlePasteOptions) => {
      try {
        pasteLog('ChatInterface', '>>> handlePaste ENTRY <<<', { contentLen: content.length });
      } catch {
        // Ignore logging errors
      }

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
        pasteLog('ChatInterface', 'Creating attachment');
        const attachment = attachmentManager.current.addTextAttachment(content, metadata);
        const allAttachments = attachmentManager.current.getAll();
        setAttachments(new Map(allAttachments.map((a) => [a.id, a])));

        const labelPattern = /#(\d+)/;
        const match = labelPattern.exec(attachment.label);
        const attachNum = match ? match[1] : '1';

        const ref = `#[${attachNum}]`;
        pasteLog('ChatInterface', 'Inserting reference at cursor', { ref, cursorPosition });
        const result = insertAtCursor(input, cursorPosition, ref);
        setInput(result.text);
        cursorTokenRef.current++;
        setCursorRequest({ position: result.newCursorPos, token: cursorTokenRef.current });

        setSelectedAttachmentId(attachment.id);
        pasteLog('ChatInterface', 'Attachment created', {
          id: attachment.id,
          label: attachment.label,
        });
      } else {
        pasteLog('ChatInterface', 'Inserting content inline at cursor', { cursorPosition });
        const result = insertAtCursor(input, cursorPosition, content);
        setInput(result.text);
        cursorTokenRef.current++;
        setCursorRequest({ position: result.newCursorPos, token: cursorTokenRef.current });
      }
      pasteLog('ChatInterface', 'handlePaste complete');
    },
    []
  );

  const handleRemoveAttachment = useCallback(
    (id: string, setInput: React.Dispatch<React.SetStateAction<string>>) => {
      const attachment = attachmentManager.current.get(id);
      const attachNum = attachment ? AttachmentManager.getAttachmentNumber(attachment.label) : null;

      const sortedList = attachmentManager.current.getAll();
      const removedIndex = sortedList.findIndex((a) => a.id === id);

      attachmentManager.current.remove(id);
      const allAttachments = attachmentManager.current.getAll();
      setAttachments(new Map(allAttachments.map((a) => [a.id, a])));

      if (allAttachments.length === 0) {
        attachmentManager.current.resetCounters();
      }

      if (attachNum) {
        setInput((prev) => {
          const pattern = new RegExp(`#\\[${attachNum}\\]`, 'g');
          return prev.replace(pattern, '#[x]');
        });
        lastDeleteRef.current = { attachNum, timestamp: Date.now() };
      }

      setSelectedAttachmentId((currentSelectedId) => {
        if (currentSelectedId === id) {
          if (removedIndex > 0 && allAttachments.length > 0) {
            const prevAttachment =
              allAttachments[Math.min(removedIndex - 1, allAttachments.length - 1)];
            return prevAttachment?.id || null;
          } else if (allAttachments.length > 0) {
            return allAttachments[0]?.id || null;
          } else {
            return null;
          }
        }
        return currentSelectedId;
      });
    },
    []
  );

  const clearAttachments = useCallback(() => {
    attachmentManager.current.clearAll();
    setAttachments(new Map());
    setSelectedAttachmentId(null);
  }, []);

  return {
    attachments,
    selectedAttachmentId,
    setSelectedAttachmentId,
    attachmentManager,
    lastDeleteRef,
    handlePaste,
    handleRemoveAttachment,
    clearAttachments,
    setAttachments,
  };
}
