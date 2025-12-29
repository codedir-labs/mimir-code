/**
 * Top-level chat app component
 * Wraps ChatInterface with KeyboardProvider and sets up keyboard input capture
 */

import React, { useEffect } from 'react';
import { useStdin } from 'ink';
import { ChatInterface, ChatInterfaceProps } from '@/features/chat/components/ChatInterface.js';
import { KeyboardProvider, useKeyboardInput } from '@/shared/keyboard/index.js';
import type { IFileSystem } from '@codedir/mimir-agents';
import { logger } from '@/shared/utils/logger.js';

export interface ChatAppProps extends ChatInterfaceProps {
  fs: IFileSystem;
  projectRoot?: string;
}

/**
 * Inner component that uses keyboard hooks
 * Must be inside KeyboardProvider
 */
function ChatInterfaceWithKeyboard(props: ChatInterfaceProps): React.JSX.Element {
  const { stdin: _stdin, setRawMode, isRawModeSupported } = useStdin();

  // Enable raw mode using Ink's API (not process.stdin directly)
  useEffect(() => {
    if (isRawModeSupported) {
      setRawMode(true);
      logger.debug('Raw mode enabled via Ink useStdin', {
        isRawModeSupported,
        platform: process.platform,
      });
    } else {
      logger.warn('Raw mode not supported in this environment', {
        platform: process.platform,
        isTTY: process.stdin.isTTY,
      });
    }

    // Cleanup: Ink handles restoring raw mode automatically
    // DO NOT manually call setRawMode(false) here - causes UV_HANDLE_CLOSING
    return () => {
      // Intentionally empty - Ink handles cleanup
    };
  }, [setRawMode, isRawModeSupported]);

  // Global keyboard input capture - dispatches to KeyboardEventBus
  // Components subscribe to actions via useKeyboardAction hooks
  // Only configured keybindings are intercepted; all other keys pass through to ink-text-input
  useKeyboardInput({ isActive: true });

  return <ChatInterface {...props} />;
}

/**
 * Top-level chat app with keyboard handling
 */
export function ChatApp({ fs, projectRoot, ...chatProps }: ChatAppProps): JSX.Element {
  return (
    <KeyboardProvider
      bindingsConfig={chatProps.config.keyBindings}
      fs={fs}
      projectRoot={projectRoot}
    >
      <ChatInterfaceWithKeyboard {...chatProps} />
    </KeyboardProvider>
  );
}
