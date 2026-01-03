/**
 * Platform abstraction interfaces
 * These will be provided by the main CLI when using this package
 */

/**
 * File system interface (platform abstraction)
 */
export interface IFileSystem {
  // Read operations
  readFile(path: string, encoding?: 'utf-8'): Promise<string | Buffer>;
  exists(path: string): Promise<boolean>;
  readdir(path: string): Promise<string[]>;

  // Write operations
  writeFile(path: string, content: string | Buffer): Promise<void>;
  appendFile(path: string, content: string): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  ensureDir(path: string): Promise<void>;

  // Delete operations
  remove(path: string): Promise<void>;
  unlink(path: string): Promise<void>;

  // Path operations
  join(...paths: string[]): string;
  dirname(path: string): string;
  basename(path: string): string;
}
