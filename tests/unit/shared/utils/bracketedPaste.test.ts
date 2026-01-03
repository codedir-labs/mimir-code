/**
 * Unit tests for bracketed paste utilities
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  detectBracketedPaste,
  supportsBracketedPaste,
  shouldCreateAttachment,
  detectPasteHeuristic,
  stripBracketedPasteMarkers,
  getPasteStats,
  enableBracketedPaste,
  disableBracketedPaste,
} from '@/shared/utils/bracketedPaste.js';

describe('Bracketed Paste Utilities', () => {
  describe('detectBracketedPaste', () => {
    it('should detect bracketed paste sequences', () => {
      const input = '\x1b[200~Hello World\x1b[201~';
      const result = detectBracketedPaste(input);

      expect(result.isPaste).toBe(true);
      expect(result.content).toBe('Hello World');
      expect(result.originalInput).toBe(input);
    });

    it('should extract multi-line content', () => {
      const pastedContent = 'Line 1\nLine 2\nLine 3';
      const input = `\x1b[200~${pastedContent}\x1b[201~`;
      const result = detectBracketedPaste(input);

      expect(result.isPaste).toBe(true);
      expect(result.content).toBe(pastedContent);
    });

    it('should handle empty paste', () => {
      const input = '\x1b[200~\x1b[201~';
      const result = detectBracketedPaste(input);

      expect(result.isPaste).toBe(true);
      expect(result.content).toBe('');
    });

    it('should return false for non-paste input', () => {
      const input = 'Regular typed text';
      const result = detectBracketedPaste(input);

      expect(result.isPaste).toBe(false);
      expect(result.content).toBe('');
      expect(result.originalInput).toBe(input);
    });

    it('should return false if only start marker present', () => {
      const input = '\x1b[200~Hello World';
      const result = detectBracketedPaste(input);

      expect(result.isPaste).toBe(false);
    });

    it('should return false if only end marker present', () => {
      const input = 'Hello World\x1b[201~';
      const result = detectBracketedPaste(input);

      expect(result.isPaste).toBe(false);
    });

    it('should return false if markers in wrong order', () => {
      const input = '\x1b[201~Hello World\x1b[200~';
      const result = detectBracketedPaste(input);

      expect(result.isPaste).toBe(false);
    });

    it('should handle paste with special characters', () => {
      const pastedContent = 'Hello @#$%^&*() \t\n\r World';
      const input = `\x1b[200~${pastedContent}\x1b[201~`;
      const result = detectBracketedPaste(input);

      expect(result.isPaste).toBe(true);
      expect(result.content).toBe(pastedContent);
    });

    it('should handle paste with unicode/emoji', () => {
      const pastedContent = 'Hello 👋 World 🌍';
      const input = `\x1b[200~${pastedContent}\x1b[201~`;
      const result = detectBracketedPaste(input);

      expect(result.isPaste).toBe(true);
      expect(result.content).toBe(pastedContent);
    });
  });

  describe('supportsBracketedPaste', () => {
    let originalIsTTY: boolean;
    let originalTERM: string | undefined;

    beforeEach(() => {
      originalIsTTY = process.stdout.isTTY;
      originalTERM = process.env.TERM;
    });

    afterEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true });
      if (originalTERM === undefined) {
        delete process.env.TERM;
      } else {
        process.env.TERM = originalTERM;
      }
    });

    it('should return false if not TTY', () => {
      Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true });
      expect(supportsBracketedPaste()).toBe(false);
    });

    it('should return true for TTY with normal TERM', () => {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true });
      process.env.TERM = 'xterm-256color';
      expect(supportsBracketedPaste()).toBe(true);
    });

    it('should return false for dumb terminal', () => {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true });
      process.env.TERM = 'dumb';
      expect(supportsBracketedPaste()).toBe(false);
    });

    it('should return false for unknown terminal', () => {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true });
      process.env.TERM = 'unknown';
      expect(supportsBracketedPaste()).toBe(false);
    });

    it('should default to true for TTY without TERM', () => {
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true });
      delete process.env.TERM;
      expect(supportsBracketedPaste()).toBe(true);
    });
  });

  describe('shouldCreateAttachment', () => {
    it('should return true for content >200 chars', () => {
      const content = 'x'.repeat(201);
      expect(shouldCreateAttachment(content)).toBe(true);
    });

    it('should return false for content <=200 chars', () => {
      const content = 'x'.repeat(200);
      expect(shouldCreateAttachment(content)).toBe(false);
    });

    it('should return true for long content even with single line', () => {
      // Many chars in 1 line should create attachment if over threshold
      const content = 'x'.repeat(1000);
      expect(shouldCreateAttachment(content)).toBe(true);
    });

    it('should return false for short content even with many lines', () => {
      // Many lines but short total length should NOT create attachment
      const content = Array(50).fill('x').join('\n');
      expect(shouldCreateAttachment(content)).toBe(false); // 50 x's + 49 newlines = 99 chars
    });

    it('should handle edge case of exactly 200 chars', () => {
      const content = 'x'.repeat(200);
      expect(shouldCreateAttachment(content)).toBe(false);
    });
  });

  describe('detectPasteHeuristic', () => {
    it('should detect paste with newlines', () => {
      const oldValue = 'Hello';
      const newValue = 'Hello\nWorld';
      expect(detectPasteHeuristic(newValue, oldValue)).toBe(true);
    });

    it('should detect paste with large delta (>10 chars)', () => {
      const oldValue = 'Hello';
      const newValue = 'Hello this is a long pasted text';
      expect(detectPasteHeuristic(newValue, oldValue)).toBe(true);
    });

    it('should not detect typed input with small delta', () => {
      const oldValue = 'Hello';
      const newValue = 'Hello W';
      expect(detectPasteHeuristic(newValue, oldValue)).toBe(false);
    });

    it('should handle edge case of exactly 10 char delta', () => {
      const oldValue = 'Hello';
      const newValue = 'Hello12345'; // +10 chars (not >10)
      expect(detectPasteHeuristic(newValue, oldValue)).toBe(false);
    });

    it('should detect 11 char delta as paste', () => {
      const oldValue = 'Hello';
      const newValue = 'Hello12345678901'; // +11 chars (16 - 5 = 11)
      expect(detectPasteHeuristic(newValue, oldValue)).toBe(true);
    });

    it('should handle empty old value', () => {
      const oldValue = '';
      const newValue = 'This is a long pasted text';
      expect(detectPasteHeuristic(newValue, oldValue)).toBe(true);
    });

    it('should handle empty new value', () => {
      const oldValue = 'Hello';
      const newValue = '';
      expect(detectPasteHeuristic(newValue, oldValue)).toBe(false);
    });
  });

  describe('stripBracketedPasteMarkers', () => {
    it('should remove start and end markers', () => {
      const input = '\x1b[200~Hello World\x1b[201~';
      const result = stripBracketedPasteMarkers(input);
      expect(result).toBe('Hello World');
    });

    it('should remove multiple occurrences', () => {
      const input = '\x1b[200~First\x1b[201~ and \x1b[200~Second\x1b[201~';
      const result = stripBracketedPasteMarkers(input);
      expect(result).toBe('First and Second');
    });

    it('should handle input without markers', () => {
      const input = 'No markers here';
      const result = stripBracketedPasteMarkers(input);
      expect(result).toBe(input);
    });

    it('should handle empty string', () => {
      expect(stripBracketedPasteMarkers('')).toBe('');
    });

    it('should handle partial markers', () => {
      const input = '\x1b[200~Incomplete';
      const result = stripBracketedPasteMarkers(input);
      expect(result).toBe('Incomplete');
    });
  });

  describe('getPasteStats', () => {
    it('should calculate stats for empty string', () => {
      const stats = getPasteStats('');
      expect(stats).toEqual({
        chars: 0,
        lines: 1, // Empty string is 1 line
        words: 0,
        size: 0,
      });
    });

    it('should calculate stats for single line', () => {
      const content = 'Hello World';
      const stats = getPasteStats(content);

      expect(stats.chars).toBe(11);
      expect(stats.lines).toBe(1);
      expect(stats.words).toBe(2);
      expect(stats.size).toBeGreaterThan(0);
    });

    it('should calculate stats for multi-line content', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const stats = getPasteStats(content);

      expect(stats.chars).toBe(20);
      expect(stats.lines).toBe(3);
      expect(stats.words).toBe(6);
    });

    it('should count words correctly', () => {
      const content = 'One   two    three'; // Multiple spaces
      const stats = getPasteStats(content);

      expect(stats.words).toBe(3);
    });

    it('should handle unicode characters', () => {
      const content = 'Hello 👋 World 🌍';
      const stats = getPasteStats(content);

      expect(stats.chars).toBe(17);
      expect(stats.words).toBe(4);
      expect(stats.size).toBeGreaterThan(stats.chars); // Unicode takes more bytes
    });

    it('should count lines with different line endings', () => {
      const content = 'Line 1\nLine 2\r\nLine 3';
      const stats = getPasteStats(content);

      expect(stats.lines).toBeGreaterThanOrEqual(3);
    });
  });

  describe('enableBracketedPaste', () => {
    let writeSpy: ReturnType<typeof vi.spyOn>;
    let originalIsTTY: boolean;

    beforeEach(() => {
      originalIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true });
      writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      writeSpy.mockRestore();
      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true });
    });

    it('should write enable sequence to stdout', () => {
      enableBracketedPaste();
      expect(writeSpy).toHaveBeenCalledWith('\x1b[?2004h');
    });

    it('should not write if not TTY', () => {
      Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true });
      enableBracketedPaste();
      expect(writeSpy).not.toHaveBeenCalled();
    });
  });

  describe('disableBracketedPaste', () => {
    let writeSpy: ReturnType<typeof vi.spyOn>;
    let originalIsTTY: boolean;

    beforeEach(() => {
      originalIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, 'isTTY', { value: true, writable: true });
      writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    });

    afterEach(() => {
      writeSpy.mockRestore();
      Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, writable: true });
    });

    it('should write disable sequence to stdout', () => {
      disableBracketedPaste();
      expect(writeSpy).toHaveBeenCalledWith('\x1b[?2004l');
    });

    it('should not write if not TTY', () => {
      Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true });
      disableBracketedPaste();
      expect(writeSpy).not.toHaveBeenCalled();
    });
  });
});
