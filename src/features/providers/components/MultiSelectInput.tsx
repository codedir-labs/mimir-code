/**
 * Multi-select input component for provider selection
 */

import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';

/**
 * Item option
 */
export interface SelectItem {
  label: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

/**
 * Props
 */
export interface MultiSelectInputProps {
  items: SelectItem[];
  onSubmit: (selected: string[]) => void;
  onCancel?: () => void;
  initialSelected?: string[];
  limit?: number;
}

/**
 * Multi-select input component
 */
export const MultiSelectInput: React.FC<MultiSelectInputProps> = ({
  items,
  onSubmit,
  onCancel,
  initialSelected = [],
  limit,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set(initialSelected));

  useInput((input, key) => {
    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      setSelectedIndex(Math.min(items.length - 1, selectedIndex + 1));
    } else if (input === ' ' && !items[selectedIndex]?.disabled) {
      // Toggle selection
      const value = items[selectedIndex]?.value;
      if (value === undefined) return;

      const newSelected = new Set(selectedValues);

      if (newSelected.has(value)) {
        newSelected.delete(value);
      } else {
        if (!limit || newSelected.size < limit) {
          newSelected.add(value);
        }
      }

      setSelectedValues(newSelected);
    } else if (key.return) {
      onSubmit(Array.from(selectedValues));
    } else if (key.escape && onCancel) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((item, index) => {
        const isSelected = selectedIndex === index;
        const isChecked = selectedValues.has(item.value);
        const isDisabled = item.disabled || false;

        return (
          <Box key={item.value} marginBottom={item.description ? 1 : 0}>
            <Box>
              <Text color={isSelected ? 'cyan' : undefined}>
                {isSelected ? '> ' : '  '}
              </Text>
              <Text color={isDisabled ? 'gray' : undefined}>
                [{isChecked ? '✓' : ' '}] {item.label}
              </Text>
            </Box>
            {item.description && (
              <Box paddingLeft={4}>
                <Text dimColor>{item.description}</Text>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
};
