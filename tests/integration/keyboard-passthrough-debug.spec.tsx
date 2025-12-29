/**
 * Debug test to verify keyboard passthrough behavior
 * Tests if multiple useInput hooks can coexist and how events propagate
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useState } from 'react';
import { render, useInput } from 'ink-testing-library';
import { Text, Box } from 'ink';

describe('Keyboard Passthrough Debug', () => {
  describe('Multiple useInput hooks behavior', () => {
    it('should show which hook receives input when both are active', () => {
      const hook1Calls: string[] = [];
      const hook2Calls: string[] = [];

      function TestComponent() {
        // First hook (like our useKeyboardInput)
        useInput((input, key) => {
          hook1Calls.push(`hook1: ${input}`);
          // Early return (passthrough attempt)
          if (input !== 'x') {
            return;
          }
        }, { isActive: true });

        // Second hook (like TextInput's useInput)
        useInput((input, key) => {
          hook2Calls.push(`hook2: ${input}`);
        }, { isActive: true });

        return <Text>Test</Text>;
      }

      const { stdin } = render(<TestComponent />);

      // Send input
      stdin.write('a');
      stdin.write('b');
      stdin.write('x');

      // Check which hooks received the input
      console.log('Hook 1 calls:', hook1Calls);
      console.log('Hook 2 calls:', hook2Calls);

      // EXPECTED: Both hooks should receive all input
      // ACTUAL: Only first hook receives input (this is the bug!)
      expect(hook1Calls.length).toBeGreaterThan(0);
      expect(hook2Calls.length).toBeGreaterThan(0); // This might fail!
    });

    it('should test conditional isActive toggling', () => {
      const hook1Calls: string[] = [];
      const hook2Calls: string[] = [];

      function TestComponent() {
        const [interceptMode, setInterceptMode] = useState(false);

        // First hook - only active when intercepting
        useInput((input, key) => {
          hook1Calls.push(`hook1: ${input}`);
          if (input === 'm') {
            setInterceptMode(!interceptMode);
          }
        }, { isActive: interceptMode });

        // Second hook - only active when NOT intercepting
        useInput((input, key) => {
          hook2Calls.push(`hook2: ${input}`);
          if (input === 'm') {
            setInterceptMode(!interceptMode);
          }
        }, { isActive: !interceptMode });

        return <Text>Mode: {interceptMode ? 'intercept' : 'passthrough'}</Text>;
      }

      const { stdin } = render(<TestComponent />);

      // Initially in passthrough mode
      stdin.write('a'); // Should go to hook2
      stdin.write('m'); // Toggle to intercept mode
      stdin.write('b'); // Should go to hook1
      stdin.write('m'); // Toggle back
      stdin.write('c'); // Should go to hook2

      console.log('Hook 1 calls:', hook1Calls);
      console.log('Hook 2 calls:', hook2Calls);
    });

    it('should test if returning from handler allows next hook to process', () => {
      let firstHandlerCalled = false;
      let secondHandlerCalled = false;

      function TestComponent() {
        useInput((input) => {
          firstHandlerCalled = true;
          return; // Early return
        }, { isActive: true });

        useInput((input) => {
          secondHandlerCalled = true;
        }, { isActive: true });

        return <Text>Test</Text>;
      }

      const { stdin } = render(<TestComponent />);
      stdin.write('a');

      console.log('First handler called:', firstHandlerCalled);
      console.log('Second handler called:', secondHandlerCalled);

      // If second handler NOT called, then returning doesn't help!
      expect(firstHandlerCalled).toBe(true);
    });
  });

  describe('Home/End key detection', () => {
    it('should detect what Ink provides for Home/End keys', () => {
      const receivedKeys: Array<{ input: string; key: any }> = [];

      function TestComponent() {
        useInput((input, key) => {
          receivedKeys.push({ input, key });
        });

        return <Text>Test</Text>;
      }

      const { stdin } = render(<TestComponent />);

      // Terminal escape sequences for Home/End
      // Home: \x1b[H or \x1b[1~
      // End: \x1b[F or \x1b[4~
      stdin.write('\x1b[H'); // Home
      stdin.write('\x1b[F'); // End
      stdin.write('\x1b[1~'); // Home (alternative)
      stdin.write('\x1b[4~'); // End (alternative)

      console.log('Received keys:', receivedKeys);

      // This will show us what Ink actually provides
      // so we know how to detect Home/End in inkKeyToString()
    });
  });
});
