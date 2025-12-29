/**
 * React context for keyboard event bus
 * Provides centralized keyboard handling to all components
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { KeyboardEventBus, KeyboardEventContext } from './KeyboardEventBus.js';
import { KeyBindingsManager } from '@/shared/utils/KeyBindings.js';
import type { IFileSystem } from '@codedir/mimir-agents';
import { KeyBindingsConfig } from '@/shared/config/schemas.js';
import { logger } from '@/shared/utils/logger.js';

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
    logger.info('[KB-INIT] KeyboardProvider initializing', {
      config: JSON.stringify(bindingsConfig, null, 2),
    });

    const bindingsManager = new KeyBindingsManager(bindingsConfig);
    const eventBus = new KeyboardEventBus(bindingsManager);

    // Log all configured bindings
    const allBindings = bindingsManager.getAllBindings();
    const bindingsList: Array<{ action: string; keys: string[] }> = [];
    allBindings.forEach((binding, action) => {
      bindingsList.push({ action, keys: binding.keys });
    });
    logger.info('[KB-INIT] Configured keybindings', {
      bindings: JSON.stringify(bindingsList, null, 2),
    });

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

  return <KeyboardContext.Provider value={contextValue}>{children}</KeyboardContext.Provider>;
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
