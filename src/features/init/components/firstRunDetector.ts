/**
 * First-run detection utility
 * Checks if this is the first time Mimir is being run (no global config exists)
 */

import type { IFileSystem } from '@codedir/mimir-agents';
import path from 'path';
import os from 'os';

export class FirstRunDetector {
  constructor(private fs: IFileSystem) {}

  async isFirstRun(): Promise<boolean> {
    const globalConfigPath = this.getGlobalConfigPath();
    const exists = await this.fs.exists(globalConfigPath);
    return !exists;
  }

  getGlobalConfigPath(): string {
    const homeDir = os.homedir();
    return path.join(homeDir, '.mimir', 'config.yml');
  }

  async getGlobalConfigDir(): Promise<string> {
    const homeDir = os.homedir();
    return path.join(homeDir, '.mimir');
  }
}
