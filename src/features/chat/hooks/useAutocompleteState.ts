/**
 * Custom hook for autocomplete state management
 * Extracts autocomplete handling logic from ChatInterface
 */

import { useState, useCallback } from 'react';

interface AutocompleteStateChangeEvent {
  itemCount: number;
  isParameterMode: boolean;
  shouldShow: boolean;
  actualHeight?: number;
}

interface UseAutocompleteStateOptions {
  autocompleteAutoShow: boolean;
}

interface UseAutocompleteStateResult {
  isAutocompleteShowing: boolean;
  setIsAutocompleteShowing: React.Dispatch<React.SetStateAction<boolean>>;
  autocompleteSelectedIndex: number;
  setAutocompleteSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  autocompleteItemCount: number;
  actualAutocompleteHeight: number;
  manuallyClosedAutocomplete: boolean;
  setManuallyClosedAutocomplete: React.Dispatch<React.SetStateAction<boolean>>;
  handleAutocompleteStateChange: (state: AutocompleteStateChangeEvent) => void;
  handleInputChange: (
    newValue: string,
    setInput: React.Dispatch<React.SetStateAction<string>>
  ) => void;
}

export function useAutocompleteState(
  options: UseAutocompleteStateOptions
): UseAutocompleteStateResult {
  const { autocompleteAutoShow } = options;

  const [isAutocompleteShowing, setIsAutocompleteShowing] = useState(false);
  const [autocompleteSelectedIndex, setAutocompleteSelectedIndex] = useState(0);
  const [autocompleteItemCount, setAutocompleteItemCount] = useState(0);
  const [actualAutocompleteHeight, setActualAutocompleteHeight] = useState(0);
  const [manuallyClosedAutocomplete, setManuallyClosedAutocomplete] = useState(false);

  const handleAutocompleteStateChange = useCallback(
    (state: AutocompleteStateChangeEvent) => {
      setAutocompleteItemCount(state.itemCount);

      if (state.actualHeight !== undefined) {
        setActualAutocompleteHeight(state.actualHeight);
      }

      if (
        autocompleteAutoShow &&
        state.shouldShow &&
        !manuallyClosedAutocomplete &&
        state.itemCount > 0
      ) {
        setIsAutocompleteShowing((prev) => {
          if (!prev) {
            setAutocompleteSelectedIndex(0);
          }
          return true;
        });
      } else if (!state.shouldShow) {
        setIsAutocompleteShowing(false);
        setActualAutocompleteHeight(0);
      }
    },
    [manuallyClosedAutocomplete, autocompleteAutoShow]
  );

  const handleInputChange = useCallback(
    (newValue: string, setInput: React.Dispatch<React.SetStateAction<string>>) => {
      setInput(newValue);
      setManuallyClosedAutocomplete(false);
      setAutocompleteSelectedIndex(0);
    },
    []
  );

  return {
    isAutocompleteShowing,
    setIsAutocompleteShowing,
    autocompleteSelectedIndex,
    setAutocompleteSelectedIndex,
    autocompleteItemCount,
    actualAutocompleteHeight,
    manuallyClosedAutocomplete,
    setManuallyClosedAutocomplete,
    handleAutocompleteStateChange,
    handleInputChange,
  };
}
