/**
 * Platform-agnostic file system interface
 * Implementation will use fs/promises + globby
 */

export interface Stats {
  isFile(): boolean;
  isDirectory(): boolean;
  size: number;
  mtime: Date;
}

export interface IFileSystem {
  /**
   * Read file contents as string
   */
  readFile(path: string, encoding?: BufferEncoding): Promise<string>;

  /**
   * Write content to file
   */
  writeFile(path: string, content: string, encoding?: BufferEncoding): Promise<void>;

  /**
   * Check if file or directory exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Create directory (recursive)
   */
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;

  /**
   * Read directory contents
   */
  readdir(path: string): Promise<string[]>;

  /**
   * Get file/directory stats
   */
  stat(path: string): Promise<Stats>;

  /**
   * Delete file
   */
  unlink(path: string): Promise<void>;

  /**
   * Remove directory (recursive)
   */
  rmdir(path: string, options?: { recursive?: boolean }): Promise<void>;

  /**
   * Copy file
   */
  copyFile(src: string, dest: string): Promise<void>;

  /**
   * Find files matching glob pattern
   */
  glob(pattern: string, options?: { cwd?: string; ignore?: string[] }): Promise<string[]>;
}
