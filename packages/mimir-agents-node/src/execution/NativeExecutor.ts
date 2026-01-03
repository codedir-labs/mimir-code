/**
 * Native executor - runs commands directly on host machine
 *
 * Security model:
 * - Permission system (allowlist/deny)
 * - Risk assessment before execution
 * - Filesystem restrictions (read anywhere, write in project only)
 * - Audit logging
 */

import path from 'node:path';
import type {
  IFileSystem,
  IProcessExecutor,
  PermissionManagerConfig,
  IExecutor,
  ExecuteOptions,
  ExecuteResult,
  ExecutionConfig,
  FileOptions,
  ExecutionMode,
} from '@codedir/mimir-agents';
import {
  PermissionManager,
  ExecutorPermissionDeniedError as PermissionDeniedError,
  ExecutorSecurityError as SecurityError,
  ExecutionError,
} from '@codedir/mimir-agents';

/**
 * Audit log entry
 */
interface AuditLogEntry {
  timestamp: Date;
  type: 'bash' | 'file_read' | 'file_write' | 'file_delete';
  operation: string;
  result: 'success' | 'failure' | 'denied';
  duration?: number;
  exitCode?: number;
  error?: string;
  reason?: string;
}

/**
 * Native executor implementation
 */
export class NativeExecutor implements IExecutor {
  private cwd: string;
  private auditLog: AuditLogEntry[] = [];

  constructor(
    private fs: IFileSystem,
    private process: IProcessExecutor,
    permissionConfig: PermissionManagerConfig,
    private config: ExecutionConfig
  ) {
    this.cwd = config.projectDir;
    this.permissionManager = new PermissionManager(permissionConfig);
  }

  private permissionManager: PermissionManager;

  /**
   * Initialize (no-op for native executor)
   */
  async initialize(): Promise<void> {
    // Native executor doesn't need initialization
    // Already running on host
  }

  /**
   * Execute bash command
   */
  async execute(command: string, options: ExecuteOptions = {}): Promise<ExecuteResult> {
    const startTime = Date.now();
    const cwd = options.cwd || this.cwd;

    try {
      // 1. Validate working directory (must be in project)
      if (!this.isWithinProject(cwd)) {
        const error = new SecurityError(`Working directory outside project: ${cwd}`);
        await this.audit({
          type: 'bash',
          operation: command,
          result: 'denied',
          reason: 'Working directory outside project',
        });
        throw error;
      }

      // 2. Check permission
      const permission = await this.permissionManager.checkPermission({
        type: 'bash',
        command,
        workingDir: cwd,
      });

      if (!permission.allowed) {
        const error = new PermissionDeniedError(`Command denied: ${command}`, permission.reason);
        await this.audit({
          type: 'bash',
          operation: command,
          result: 'denied',
          reason: permission.reason,
        });
        throw error;
      }

      // 3. Execute command
      const result = await this.process.execute(command, {
        cwd,
        env: options.env,
        timeout: options.timeout || 120_000,
      });

      // 4. Audit log success
      await this.audit({
        type: 'bash',
        operation: command,
        result: 'success',
        exitCode: result.exitCode,
        duration: Date.now() - startTime,
      });

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      // Audit log failure
      await this.audit({
        type: 'bash',
        operation: command,
        result: 'failure',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      });

      if (error instanceof PermissionDeniedError || error instanceof SecurityError) {
        throw error;
      }

      // Wrap execution errors
      const err = error as any;
      throw new ExecutionError(`Command failed: ${command}`, err.exitCode, err.stdout, err.stderr);
    }
  }

  /**
   * Read file
   */
  async readFile(filePath: string, _options: FileOptions = {}): Promise<string> {
    const absolutePath = this.resolvePath(filePath);

    try {
      // Native executor can read anywhere (like Claude Code)
      // No permission check for reads
      const content = await this.fs.readFile(absolutePath, 'utf-8');

      await this.audit({
        type: 'file_read',
        operation: absolutePath,
        result: 'success',
      });

      // Ensure we return string
      return typeof content === 'string' ? content : content.toString();
    } catch (error) {
      await this.audit({
        type: 'file_read',
        operation: absolutePath,
        result: 'failure',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Write file
   */
  async writeFile(filePath: string, content: string, options: FileOptions = {}): Promise<void> {
    const absolutePath = this.resolvePath(filePath);

    try {
      // Check if path is within allowed write locations
      if (!this.canWrite(absolutePath)) {
        const error = new PermissionDeniedError(
          `Cannot write to ${absolutePath} (outside allowed paths)`
        );
        await this.audit({
          type: 'file_write',
          operation: absolutePath,
          result: 'denied',
          reason: 'Outside allowed paths',
        });
        throw error;
      }

      // Check permission
      const permission = await this.permissionManager.checkPermission({
        type: 'file_write',
        path: absolutePath,
      });

      if (!permission.allowed) {
        const error = new PermissionDeniedError(`Write denied: ${absolutePath}`, permission.reason);
        await this.audit({
          type: 'file_write',
          operation: absolutePath,
          result: 'denied',
          reason: permission.reason,
        });
        throw error;
      }

      // Create parent directories if needed
      if (options.createDirs) {
        const dir = path.dirname(absolutePath);
        await this.fs.mkdir(dir, { recursive: true });
      }

      const encoding = options.encoding || 'utf-8';
      await this.fs.writeFile(absolutePath, content, encoding);

      await this.audit({
        type: 'file_write',
        operation: absolutePath,
        result: 'success',
      });
    } catch (error) {
      if (error instanceof PermissionDeniedError || error instanceof SecurityError) {
        throw error;
      }

      await this.audit({
        type: 'file_write',
        operation: absolutePath,
        result: 'failure',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if file exists
   */
  async exists(filePath: string): Promise<boolean> {
    const absolutePath = this.resolvePath(filePath);
    return await this.fs.exists(absolutePath);
  }

  /**
   * List directory contents
   */
  async listDir(dirPath: string): Promise<string[]> {
    const absolutePath = this.resolvePath(dirPath);
    const entries = await this.fs.readdir(absolutePath);
    return entries;
  }

  /**
   * Delete file
   */
  async deleteFile(filePath: string): Promise<void> {
    const absolutePath = this.resolvePath(filePath);

    try {
      // Check if path is within allowed write locations
      if (!this.canWrite(absolutePath)) {
        const error = new PermissionDeniedError(
          `Cannot delete ${absolutePath} (outside allowed paths)`
        );
        await this.audit({
          type: 'file_delete',
          operation: absolutePath,
          result: 'denied',
          reason: 'Outside allowed paths',
        });
        throw error;
      }

      // Check permission
      const permission = await this.permissionManager.checkPermission({
        type: 'file_delete',
        path: absolutePath,
      });

      if (!permission.allowed) {
        const error = new PermissionDeniedError(
          `Delete denied: ${absolutePath}`,
          permission.reason
        );
        await this.audit({
          type: 'file_delete',
          operation: absolutePath,
          result: 'denied',
          reason: permission.reason,
        });
        throw error;
      }

      await this.fs.unlink(absolutePath);

      await this.audit({
        type: 'file_delete',
        operation: absolutePath,
        result: 'success',
      });
    } catch (error) {
      if (error instanceof PermissionDeniedError || error instanceof SecurityError) {
        throw error;
      }

      await this.audit({
        type: 'file_delete',
        operation: absolutePath,
        result: 'failure',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Cleanup (no-op for native executor)
   */
  async cleanup(): Promise<void> {
    // Nothing to cleanup for native executor
  }

  /**
   * Get execution mode
   */
  getMode(): ExecutionMode {
    return 'native';
  }

  /**
   * Get current working directory
   */
  getCwd(): string {
    return this.cwd;
  }

  /**
   * Set current working directory
   */
  setCwd(cwd: string): void {
    if (!this.isWithinProject(cwd)) {
      throw new SecurityError(`Cannot set cwd outside project: ${cwd}`);
    }
    this.cwd = cwd;
  }

  /**
   * Get audit log
   */
  getAuditLog(): readonly AuditLogEntry[] {
    return [...this.auditLog];
  }

  /**
   * Clear audit log
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }

  /**
   * Resolve file path (relative or absolute)
   */
  private resolvePath(filePath: string): string {
    if (path.isAbsolute(filePath)) {
      return path.normalize(filePath);
    }
    return path.resolve(this.cwd, filePath);
  }

  /**
   * Check if path is within project
   */
  private isWithinProject(targetPath: string): boolean {
    const projectDir = path.normalize(this.config.projectDir);
    const resolved = path.normalize(targetPath);
    return resolved.startsWith(projectDir);
  }

  /**
   * Check if can write to path
   */
  private canWrite(filePath: string): boolean {
    const normalized = path.normalize(filePath);
    const projectDir = path.normalize(this.config.projectDir);

    // Must be within project
    if (!normalized.startsWith(projectDir)) {
      return false;
    }

    // Check denied paths
    const deniedPaths = this.config.filesystem?.deniedPaths || [
      '**/.env',
      '**/.git/**',
      '**/node_modules/**',
    ];

    for (const deniedPattern of deniedPaths) {
      if (this.matchesGlob(normalized, deniedPattern)) {
        return false;
      }
    }

    // Check allowed write paths
    const writeAccess = this.config.filesystem?.writeAccess;
    if (writeAccess && writeAccess.length > 0) {
      // If write access is specified, must match one of the patterns
      return writeAccess.some((pattern) => this.matchesGlob(normalized, pattern));
    }

    // Default: Allow writes within project (except denied paths)
    return true;
  }

  /**
   * Simple glob matching (basic implementation)
   * TODO: Use proper glob library (minimatch, picomatch)
   */
  private matchesGlob(filePath: string, pattern: string): boolean {
    // Replace ${PROJECT_DIR} with actual project directory
    let expandedPattern = pattern.replace(/\$\{PROJECT_DIR\}/g, this.config.projectDir);

    // Normalize paths to use forward slashes for consistent matching
    const normalizedFile = filePath.replace(/\\/g, '/');
    expandedPattern = expandedPattern.replace(/\\/g, '/');

    // FIRST: Replace glob wildcards with placeholders
    expandedPattern = expandedPattern
      .replace(/\*\*/g, '__GLOBSTAR__')
      .replace(/\*/g, '__STAR__')
      .replace(/\?/g, '__QMARK__');

    // SECOND: Escape special regex characters
    expandedPattern = expandedPattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');

    // THIRD: Replace placeholders with regex patterns
    const regexPattern = expandedPattern
      .replace(/__GLOBSTAR__/g, '.*') // ** → .*
      .replace(/__STAR__/g, '[^/]*') // * → [^/]*
      .replace(/__QMARK__/g, '.'); // ? → .

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(normalizedFile);
  }

  /**
   * Add audit log entry
   */
  private async audit(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
    this.auditLog.push({
      timestamp: new Date(),
      ...entry,
    });

    // Keep only last 1000 entries to prevent memory bloat
    if (this.auditLog.length > 1000) {
      this.auditLog = this.auditLog.slice(-1000);
    }
  }
}
