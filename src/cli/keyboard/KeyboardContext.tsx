/**
 * React context for keyboard event bus
 * Provides centralized keyboard handling to all components
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { KeyboardEventBus, KeyboardEventContext } from './KeyboardEventBus.js';
import { KeyBindingsManager } from '../../utils/KeyBindings.js';
import { IFileSystem } from '../../platform/IFileSystem.js';
import { KeyBindingsConfig } from '../../config/schemas.js';

interface KeyboardContextValue {
  eventBus: KeyboardEventBus;
  bindingsManager: KeyBindingsManager;
  updateContext: (updates: Partial<KeyboardEventContext>) => void;
  getContext: () => Readonly<KeyboardEventContext>;
}

const KeyboardContext = createContext<KeyboardContextValue | null>(null);

export interface KeyboardProviderProps {
  children: ReactNode;
  bindingsConfig: KeyBindingsConfig;
  fs: IFileSystem;
  projectRoot?: string;
}

/**
 * Provider for keyboard system
 * Must wrap the entire app to enable keyboard handling
 */
export function KeyboardProvider({
  children,
  bindingsConfig,
  fs: _fs,
  projectRoot: _projectRoot,
}: KeyboardProviderProps): JSX.Element {
  const [contextValue] = useState<KeyboardContextValue>(() => {
    const bindingsManager = new KeyBindingsManager(bindingsConfig);
    const eventBus = new KeyboardEventBus(bindingsManager);

    return {
      eventBus,
      bindingsManager,
      updateContext: (updates) => eventBus.updateContext(updates),
      getContext: () => eventBus.getContext(),
    };
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      contextValue.eventBus.clearAll();
    };
  }, [contextValue]);

  return (
    <KeyboardContext.Provider value={contextValue}>
      {children}
    </KeyboardContext.Provider>
  );
}

/**
 * Hook to access keyboard system
 */
export function useKeyboard(): KeyboardContextValue {
  const context = useContext(KeyboardContext);

  if (!context) {
    throw new Error('useKeyboard must be used within KeyboardProvider');
  }

  return context;
}
