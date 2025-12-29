/**
 * Unit tests for ClipboardAdapter
 * Tests platform-specific clipboard access with mocked IProcessExecutor
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ClipboardAdapter } from '../../../packages/mimir-agents-runtime/src/clipboard/ClipboardAdapter.js';
import type { IProcessExecutor } from '@codedir/mimir-agents';
import type { ExecuteResult } from '@codedir/mimir-agents';
import os from 'os';

describe('ClipboardAdapter', () => {
  let mockExecutor: IProcessExecutor;
  let adapter: ClipboardAdapter;
  let originalPlatform: NodeJS.Platform;

  beforeEach(() => {
    // Mock the executor
    mockExecutor = {
      execute: vi.fn(),
    } as unknown as IProcessExecutor;

    // Store original platform
    originalPlatform = os.platform();
  });

  describe('macOS (darwin)', () => {
    beforeEach(() => {
      // Mock platform
      vi.spyOn(os, 'platform').mockReturnValue('darwin');
      adapter = new ClipboardAdapter(mockExecutor);
    });

    it('should read text from clipboard', async () => {
      const textContent = 'Hello from macOS clipboard';

      // Mock osascript (image) to fail
      // Mock pbpaste (text) to succeed
      (mockExecutor.execute as any).mockImplementation((cmd: string) => {
        if (cmd.includes('osascript')) {
          return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
        }
        if (cmd.includes('pbpaste')) {
          return Promise.resolve({ exitCode: 0, stdout: textContent, stderr: '' });
        }
        return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
      });

      const result = await adapter.readClipboard();

      expect(result.type).toBe('text');
      expect(result.data).toBe(textContent);
      expect(result.format).toBe('plain');
    });

    it('should read image from clipboard', async () => {
      const fakeImageData = Buffer.from('fake-png-data');
      const base64Data = fakeImageData.toString('base64');

      // Mock osascript to return base64 image
      (mockExecutor.execute as any).mockImplementation((cmd: string) => {
        if (cmd.includes('osascript')) {
          return Promise.resolve({ exitCode: 0, stdout: base64Data, stderr: '' });
        }
        return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
      });

      const result = await adapter.readClipboard();

      expect(result.type).toBe('image');
      expect(result.data).toEqual(fakeImageData);
      expect(result.format).toBe('png');
    });

    it('should fallback to text if image read fails', async () => {
      const textContent = 'Fallback text';

      (mockExecutor.execute as any).mockImplementation((cmd: string) => {
        if (cmd.includes('osascript')) {
          throw new Error('Image read failed');
        }
        if (cmd.includes('pbpaste')) {
          return Promise.resolve({ exitCode: 0, stdout: textContent, stderr: '' });
        }
        return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
      });

      const result = await adapter.readClipboard();

      expect(result.type).toBe('text');
      expect(result.data).toBe(textContent);
    });

    it('should throw error if pbpaste fails', async () => {
      (mockExecutor.execute as any).mockImplementation((cmd: string) => {
        return Promise.resolve({ exitCode: 1, stdout: '', stderr: 'Error' });
      });

      await expect(adapter.readClipboard()).rejects.toThrow('Failed to read macOS clipboard');
    });

    it('should validate base64 data for images', async () => {
      const invalidBase64 = 'not-valid-base64!!!';

      (mockExecutor.execute as any).mockImplementation((cmd: string) => {
        if (cmd.includes('osascript')) {
          return Promise.resolve({ exitCode: 0, stdout: invalidBase64, stderr: '' });
        }
        if (cmd.includes('pbpaste')) {
          return Promise.resolve({ exitCode: 0, stdout: 'text fallback', stderr: '' });
        }
        return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
      });

      const result = await adapter.readClipboard();

      // Should fallback to text
      expect(result.type).toBe('text');
      expect(result.data).toBe('text fallback');
    });
  });

  describe('Windows (win32)', () => {
    beforeEach(() => {
      vi.spyOn(os, 'platform').mockReturnValue('win32');
      adapter = new ClipboardAdapter(mockExecutor);
    });

    it('should read text from clipboard', async () => {
      const textContent = 'Hello from Windows clipboard';

      (mockExecutor.execute as any).mockImplementation((cmd: string) => {
        if (cmd.includes('Get-Clipboard')) {
          return Promise.resolve({ exitCode: 0, stdout: textContent, stderr: '' });
        }
        return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
      });

      const result = await adapter.readClipboard();

      expect(result.type).toBe('text');
      expect(result.data).toBe(textContent);
      expect(result.format).toBe('plain');
    });

    it('should read image from clipboard', async () => {
      const fakeImageData = Buffer.from('fake-png-data');
      const base64Data = fakeImageData.toString('base64');

      (mockExecutor.execute as any).mockImplementation((cmd: string) => {
        if (cmd.includes('GetImage')) {
          return Promise.resolve({ exitCode: 0, stdout: base64Data, stderr: '' });
        }
        return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
      });

      const result = await adapter.readClipboard();

      expect(result.type).toBe('image');
      expect(result.data).toEqual(fakeImageData);
      expect(result.format).toBe('png');
    });

    it('should fallback to text if image read fails', async () => {
      const textContent = 'Fallback text';

      (mockExecutor.execute as any).mockImplementation((cmd: string) => {
        if (cmd.includes('GetImage')) {
          throw new Error('Image read failed');
        }
        if (cmd.includes('Get-Clipboard')) {
          return Promise.resolve({ exitCode: 0, stdout: textContent, stderr: '' });
        }
        return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
      });

      const result = await adapter.readClipboard();

      expect(result.type).toBe('text');
      expect(result.data).toBe(textContent);
    });

    it('should throw error if Get-Clipboard fails', async () => {
      (mockExecutor.execute as any).mockImplementation((cmd: string) => {
        return Promise.resolve({ exitCode: 1, stdout: '', stderr: 'Error' });
      });

      await expect(adapter.readClipboard()).rejects.toThrow('Failed to read Windows clipboard');
    });
  });

  describe('Linux', () => {
    beforeEach(() => {
      vi.spyOn(os, 'platform').mockReturnValue('linux');
    });

    describe('with xclip (X11)', () => {
      beforeEach(() => {
        adapter = new ClipboardAdapter(mockExecutor);

        (mockExecutor.execute as any).mockImplementation((cmd: string) => {
          // Mock 'which xclip' to succeed
          if (cmd === 'which xclip') {
            return Promise.resolve({ exitCode: 0, stdout: '/usr/bin/xclip', stderr: '' });
          }
          // Mock 'which wl-paste' to fail
          if (cmd === 'which wl-paste') {
            return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
          }
          return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
        });
      });

      it('should read text from clipboard', async () => {
        const textContent = 'Hello from Linux clipboard';

        (mockExecutor.execute as any).mockImplementation((cmd: string) => {
          if (cmd === 'which xclip') {
            return Promise.resolve({ exitCode: 0, stdout: '/usr/bin/xclip', stderr: '' });
          }
          if (cmd === 'which wl-paste') {
            return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
          }
          if (cmd.includes('xclip') && cmd.includes('image/png')) {
            return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
          }
          if (cmd.includes('xclip -selection clipboard -o')) {
            return Promise.resolve({ exitCode: 0, stdout: textContent, stderr: '' });
          }
          return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
        });

        const result = await adapter.readClipboard();

        expect(result.type).toBe('text');
        expect(result.data).toBe(textContent);
        expect(result.format).toBe('plain');
      });

      it('should read image from clipboard', async () => {
        const fakeImageData = Buffer.from('fake-png-data');
        const base64Data = fakeImageData.toString('base64');

        (mockExecutor.execute as any).mockImplementation((cmd: string) => {
          if (cmd === 'which xclip') {
            return Promise.resolve({ exitCode: 0, stdout: '/usr/bin/xclip', stderr: '' });
          }
          if (cmd === 'which wl-paste') {
            return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
          }
          if (cmd.includes('xclip') && cmd.includes('image/png')) {
            return Promise.resolve({ exitCode: 0, stdout: base64Data, stderr: '' });
          }
          return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
        });

        const result = await adapter.readClipboard();

        expect(result.type).toBe('image');
        expect(result.data).toEqual(fakeImageData);
        expect(result.format).toBe('png');
      });
    });

    describe('with wl-paste (Wayland)', () => {
      beforeEach(() => {
        adapter = new ClipboardAdapter(mockExecutor);

        (mockExecutor.execute as any).mockImplementation((cmd: string) => {
          // Mock 'which xclip' to fail
          if (cmd === 'which xclip') {
            return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
          }
          // Mock 'which wl-paste' to succeed
          if (cmd === 'which wl-paste') {
            return Promise.resolve({ exitCode: 0, stdout: '/usr/bin/wl-paste', stderr: '' });
          }
          return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
        });
      });

      it('should read text from clipboard', async () => {
        const textContent = 'Hello from Wayland clipboard';

        (mockExecutor.execute as any).mockImplementation((cmd: string) => {
          if (cmd === 'which xclip') {
            return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
          }
          if (cmd === 'which wl-paste') {
            return Promise.resolve({ exitCode: 0, stdout: '/usr/bin/wl-paste', stderr: '' });
          }
          if (cmd.includes('wl-paste -t image/png')) {
            return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
          }
          if (cmd === 'wl-paste') {
            return Promise.resolve({ exitCode: 0, stdout: textContent, stderr: '' });
          }
          return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
        });

        const result = await adapter.readClipboard();

        expect(result.type).toBe('text');
        expect(result.data).toBe(textContent);
        expect(result.format).toBe('plain');
      });

      it('should read image from clipboard', async () => {
        const fakeImageData = Buffer.from('fake-png-data');
        const base64Data = fakeImageData.toString('base64');

        (mockExecutor.execute as any).mockImplementation((cmd: string) => {
          if (cmd === 'which xclip') {
            return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
          }
          if (cmd === 'which wl-paste') {
            return Promise.resolve({ exitCode: 0, stdout: '/usr/bin/wl-paste', stderr: '' });
          }
          if (cmd.includes('wl-paste -t image/png')) {
            return Promise.resolve({ exitCode: 0, stdout: base64Data, stderr: '' });
          }
          return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
        });

        const result = await adapter.readClipboard();

        expect(result.type).toBe('image');
        expect(result.data).toEqual(fakeImageData);
        expect(result.format).toBe('png');
      });
    });

    describe('without clipboard tools', () => {
      it('should throw error if no tools available', async () => {
        adapter = new ClipboardAdapter(mockExecutor);

        (mockExecutor.execute as any).mockImplementation((cmd: string) => {
          if (cmd === 'which xclip' || cmd === 'which wl-paste') {
            return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
          }
          return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
        });

        await expect(adapter.readClipboard()).rejects.toThrow('No clipboard tool found on Linux');
      });
    });
  });

  describe('unsupported platform', () => {
    it('should throw error for unsupported platform', async () => {
      vi.spyOn(os, 'platform').mockReturnValue('freebsd' as NodeJS.Platform);
      adapter = new ClipboardAdapter(mockExecutor);

      await expect(adapter.readClipboard()).rejects.toThrow('Unsupported platform: freebsd');
    });
  });
});
