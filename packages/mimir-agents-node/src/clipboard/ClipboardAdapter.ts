/**
 * ClipboardAdapter
 * Cross-platform clipboard access using IProcessExecutor
 */

import type { IProcessExecutor } from '@codedir/mimir-agents';
import os from 'os';

/**
 * Clipboard content from platform adapters
 */
export interface ClipboardContent {
  /** Type of content */
  type: 'text' | 'image' | 'unknown';
  /** Content data (string or Buffer) */
  data: string | Buffer;
  /** Format (e.g., 'png', 'jpg', 'plain') */
  format?: string;
}

/**
 * Clipboard adapter for cross-platform clipboard access
 * Uses platform-specific commands via IProcessExecutor
 */
export class ClipboardAdapter {
  private platform: NodeJS.Platform;

  constructor(private executor: IProcessExecutor) {
    this.platform = os.platform();
  }

  /**
   * Read clipboard content
   * Detects platform and uses appropriate method
   *
   * @returns Clipboard content (text or image)
   * @throws Error if platform unsupported or clipboard tools missing
   */
  async readClipboard(): Promise<ClipboardContent> {
    switch (this.platform) {
      case 'darwin':
        return this.readMacClipboard();
      case 'win32':
        return this.readWindowsClipboard();
      case 'linux':
        return this.readLinuxClipboard();
      default:
        throw new Error(`Unsupported platform: ${this.platform}`);
    }
  }

  /**
   * Read clipboard on macOS
   * Uses pbpaste for text and osascript for images
   *
   * @private
   */
  private async readMacClipboard(): Promise<ClipboardContent> {
    // Try image first using osascript
    try {
      const imageScript = "osascript -e 'the clipboard as «class PNGf»' | xxd -r -p | base64";
      const imageResult = await this.executor.execute(imageScript);

      if (imageResult.exitCode === 0 && imageResult.stdout.trim()) {
        const base64Data = imageResult.stdout.trim();
        // Validate base64
        if (/^[A-Za-z0-9+/]+=*$/.test(base64Data)) {
          return {
            type: 'image',
            data: Buffer.from(base64Data, 'base64'),
            format: 'png',
          };
        }
      }
    } catch (error) {
      // Image read failed, fall through to text
    }

    // Fallback to text
    const textResult = await this.executor.execute('pbpaste');

    if (textResult.exitCode !== 0) {
      throw new Error('Failed to read macOS clipboard');
    }

    return {
      type: 'text',
      data: textResult.stdout,
      format: 'plain',
    };
  }

  /**
   * Read clipboard on Windows
   * Uses PowerShell Get-Clipboard
   *
   * @private
   */
  private async readWindowsClipboard(): Promise<ClipboardContent> {
    // Try image first using PowerShell
    const imageScript = `
      Add-Type -AssemblyName System.Windows.Forms;
      Add-Type -AssemblyName System.Drawing;
      $img = [System.Windows.Forms.Clipboard]::GetImage();
      if ($img) {
        $ms = New-Object System.IO.MemoryStream;
        $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png);
        [Convert]::ToBase64String($ms.ToArray());
      }
    `.trim();

    try {
      const imageResult = await this.executor.execute(
        `powershell -NoProfile -Command "${imageScript.replace(/"/g, '\\"')}"`
      );

      if (imageResult.exitCode === 0 && imageResult.stdout.trim()) {
        const base64Data = imageResult.stdout.trim();
        // Validate base64
        if (/^[A-Za-z0-9+/]+=*$/.test(base64Data)) {
          return {
            type: 'image',
            data: Buffer.from(base64Data, 'base64'),
            format: 'png',
          };
        }
      }
    } catch (error) {
      // Image read failed, fall through to text
    }

    // Fallback to text
    const textResult = await this.executor.execute(
      'powershell -NoProfile -Command "Get-Clipboard"'
    );

    if (textResult.exitCode !== 0) {
      throw new Error('Failed to read Windows clipboard');
    }

    return {
      type: 'text',
      data: textResult.stdout,
      format: 'plain',
    };
  }

  /**
   * Read clipboard on Linux
   * Uses xclip (X11) or wl-paste (Wayland)
   *
   * @private
   */
  private async readLinuxClipboard(): Promise<ClipboardContent> {
    // Check for available clipboard tools
    const hasXclip = await this.checkCommand('xclip');
    const hasWlPaste = await this.checkCommand('wl-paste');

    if (!hasXclip && !hasWlPaste) {
      throw new Error(
        'No clipboard tool found on Linux. Install xclip (X11) or wl-clipboard (Wayland)'
      );
    }

    // Use xclip if available (X11)
    if (hasXclip) {
      return this.readXclip();
    }

    // Use wl-paste (Wayland)
    return this.readWlPaste();
  }

  /**
   * Read clipboard using xclip (X11)
   *
   * @private
   */
  private async readXclip(): Promise<ClipboardContent> {
    // Try image first
    try {
      const imageResult = await this.executor.execute(
        'xclip -selection clipboard -t image/png -o | base64'
      );

      if (imageResult.exitCode === 0 && imageResult.stdout.trim()) {
        const base64Data = imageResult.stdout.trim();
        // Validate base64
        if (/^[A-Za-z0-9+/]+=*$/.test(base64Data)) {
          return {
            type: 'image',
            data: Buffer.from(base64Data, 'base64'),
            format: 'png',
          };
        }
      }
    } catch (error) {
      // Image read failed, fall through to text
    }

    // Fallback to text
    const textResult = await this.executor.execute('xclip -selection clipboard -o');

    if (textResult.exitCode !== 0) {
      throw new Error('Failed to read clipboard with xclip');
    }

    return {
      type: 'text',
      data: textResult.stdout,
      format: 'plain',
    };
  }

  /**
   * Read clipboard using wl-paste (Wayland)
   *
   * @private
   */
  private async readWlPaste(): Promise<ClipboardContent> {
    // Try image first
    try {
      const imageResult = await this.executor.execute('wl-paste -t image/png | base64');

      if (imageResult.exitCode === 0 && imageResult.stdout.trim()) {
        const base64Data = imageResult.stdout.trim();
        // Validate base64
        if (/^[A-Za-z0-9+/]+=*$/.test(base64Data)) {
          return {
            type: 'image',
            data: Buffer.from(base64Data, 'base64'),
            format: 'png',
          };
        }
      }
    } catch (error) {
      // Image read failed, fall through to text
    }

    // Fallback to text
    const textResult = await this.executor.execute('wl-paste');

    if (textResult.exitCode !== 0) {
      throw new Error('Failed to read clipboard with wl-paste');
    }

    return {
      type: 'text',
      data: textResult.stdout,
      format: 'plain',
    };
  }

  /**
   * Check if a command is available
   *
   * @private
   * @param cmd Command to check
   * @returns True if command exists
   */
  private async checkCommand(cmd: string): Promise<boolean> {
    try {
      const result = await this.executor.execute(`which ${cmd}`);
      return result.exitCode === 0 && result.stdout.trim().length > 0;
    } catch (error) {
      return false;
    }
  }
}
