/**
 * Executor interface - all execution modes implement this
 */

/**
 * Execution options
 */
export interface ExecuteOptions {
  /**
   * Working directory
   */
  cwd?: string;

  /**
   * Environment variables
   */
  env?: Record<string, string>;

  /**
   * Timeout in milliseconds
   */
  timeout?: number;

  /**
   * Stdin input
   */
  stdin?: string;
}

/**
 * Execution result
 */
export interface ExecuteResult {
  /**
   * Exit code (0 = success)
   */
  exitCode: number;

  /**
   * Standard output
   */
  stdout: string;

  /**
   * Standard error
   */
  stderr: string;

  /**
   * Execution duration (ms)
   */
  duration?: number;

  /**
   * Signal that terminated the process
   */
  signal?: string;
}

/**
 * File operation options
 */
export interface FileOptions {
  /**
   * Encoding (default: utf-8)
   */
  encoding?: BufferEncoding;

  /**
   * Create parent directories if they don't exist
   */
  createDirs?: boolean;
}

/**
 * Executor interface - abstraction for different execution modes
 */
export interface IExecutor {
  /**
   * Initialize executor (pull images, provision VMs, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Execute command
   */
  execute(command: string, options?: ExecuteOptions): Promise<ExecuteResult>;

  /**
   * Read file
   */
  readFile(filePath: string, options?: FileOptions): Promise<string>;

  /**
   * Write file
   */
  writeFile(filePath: string, content: string, options?: FileOptions): Promise<void>;

  /**
   * Check if file exists
   */
  exists(filePath: string): Promise<boolean>;

  /**
   * List directory contents
   */
  listDir(dirPath: string): Promise<string[]>;

  /**
   * Delete file
   */
  deleteFile(filePath: string): Promise<void>;

  /**
   * Cleanup (stop containers, delete VMs, etc.)
   */
  cleanup(): Promise<void>;

  /**
   * Get execution mode name
   */
  getMode(): ExecutionMode;

  /**
   * Get current working directory
   */
  getCwd(): string;
}

/**
 * Execution modes
 */
export type ExecutionMode = 'native' | 'devcontainer' | 'docker' | 'cloud';

/**
 * Execution configuration
 */
export interface ExecutionConfig {
  /**
   * Execution mode
   */
  mode: ExecutionMode | 'auto';

  /**
   * Project directory (absolute path)
   */
  projectDir: string;

  /**
   * Filesystem restrictions
   */
  filesystem?: {
    /**
     * Read access (default: anywhere)
     */
    readAccess?: 'anywhere' | 'project-only';

    /**
     * Write access paths (globs)
     */
    writeAccess?: string[];

    /**
     * Denied paths (globs)
     */
    deniedPaths?: string[];
  };

  /**
   * Dev container configuration
   */
  devcontainer?: {
    /**
     * Auto-detect .devcontainer/devcontainer.json
     */
    autoDetect?: boolean;

    /**
     * Custom config path
     */
    configPath?: string;

    /**
     * Workspace folder in container (default: /workspace)
     */
    workspaceFolder?: string;

    /**
     * Stop container on cleanup (default: false - keep running for reuse)
     */
    stopOnExit?: boolean;
  };

  /**
   * Docker configuration
   */
  docker?: DockerConfig;

  /**
   * Cloud configuration
   */
  cloud?: CloudConfig;
}

/**
 * Docker configuration
 */
export interface DockerConfig {
  /**
   * Dockerfile path (relative to project)
   */
  dockerfile?: string;

  /**
   * Pre-built image name
   */
  image?: string;

  /**
   * Docker Compose file
   */
  composeFile?: string;

  /**
   * Service name (if using Compose)
   */
  service?: string;

  /**
   * Workspace mount
   */
  workspaceMount?: {
    /**
     * Container path (default: /workspace)
     */
    containerPath?: string;

    /**
     * Read-only mount
     */
    readOnly?: boolean;
  };

  /**
   * Network mode
   */
  network?: 'disabled' | 'limited' | 'full';

  /**
   * Allowed domains (if network = limited)
   */
  allowedDomains?: string[];

  /**
   * CPU limit (cores, e.g., 2.0)
   */
  cpuLimit?: number;

  /**
   * Memory limit (bytes, e.g., 4 * 1024 * 1024 * 1024 for 4GB)
   */
  memoryLimit?: number;

  /**
   * Workspace folder in container (default: /workspace)
   */
  workspaceFolder?: string;

  /**
   * User to run as in container
   */
  user?: string;

  /**
   * Environment variables
   */
  env?: Record<string, string>;

  /**
   * Build arguments (for Dockerfile)
   */
  buildArgs?: Record<string, string>;

  /**
   * No cache when building (default: false)
   */
  nocache?: boolean;

  /**
   * Readonly root filesystem (default: false)
   */
  readonlyRootfs?: boolean;

  /**
   * Capabilities to add
   */
  capAdd?: string[];

  /**
   * Capabilities to drop
   */
  capDrop?: string[];

  /**
   * Auto-cleanup container after session
   */
  autoCleanup?: boolean;
}

/**
 * Cloud configuration
 */
export interface CloudConfig {
  /**
   * Teams API client
   */
  apiUrl: string;

  /**
   * Organization ID
   */
  orgId: string;

  /**
   * Auth token
   */
  authToken: string;

  /**
   * Cloud region
   */
  region?: string;

  /**
   * VM size
   */
  vmSize?: 'standard' | 'large' | 'xlarge';

  /**
   * Network mode
   */
  network?: 'disabled' | 'limited' | 'full';

  /**
   * Allowed domains (if network = limited)
   */
  allowedDomains?: string[];

  /**
   * Session timeout (seconds)
   */
  sessionTimeout?: number;
}

/**
 * Executor error types
 */
export class ExecutionError extends Error {
  constructor(
    message: string,
    public exitCode?: number,
    public stdout?: string,
    public stderr?: string
  ) {
    super(message);
    this.name = 'ExecutionError';
  }
}

export class PermissionDeniedError extends Error {
  constructor(
    message: string,
    public reason?: string
  ) {
    super(message);
    this.name = 'PermissionDeniedError';
  }
}

export class SecurityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecurityError';
  }
}
