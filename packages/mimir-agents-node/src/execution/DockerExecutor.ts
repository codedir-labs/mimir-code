/**
 * Docker executor - runs commands in user-specified Docker containers
 *
 * Features:
 * - Support for Dockerfile, image, or docker-compose
 * - Network restrictions (disabled, limited domains, full)
 * - Resource limits (CPU, memory, disk)
 * - Ephemeral containers (create-run-destroy)
 * - No dev container config required
 */

import path from 'node:path';
import type {
  IFileSystem,
  IProcessExecutor,
  IDockerClient,
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
 * Docker executor implementation
 */
export class DockerExecutor implements IExecutor {
  private containerId?: string;
  private imageName?: string;
  private workspaceFolder: string;

  constructor(
    _fs: IFileSystem,
    _process: IProcessExecutor,
    private docker: IDockerClient,
    permissionConfig: PermissionManagerConfig,
    private config: ExecutionConfig
  ) {
    this.workspaceFolder = config.docker?.workspaceFolder || '/workspace';
    this.permissionManager = new PermissionManager(permissionConfig);
  }

  private permissionManager: PermissionManager;

  /**
   * Initialize Docker container
   */
  async initialize(): Promise<void> {
    if (!this.config.docker) {
      throw new SecurityError('Docker configuration not provided');
    }

    const dockerConfig = this.config.docker;

    // 1. Build or pull image
    if (dockerConfig.dockerfile) {
      await this.buildImage(dockerConfig.dockerfile);
    } else if (dockerConfig.image) {
      this.imageName = dockerConfig.image;
      await this.pullImage(dockerConfig.image);
    } else if (dockerConfig.composeFile) {
      throw new SecurityError('Docker Compose not yet supported (use Dockerfile or image)');
    } else {
      throw new SecurityError('Docker config must specify dockerfile, image, or composeFile');
    }

    // 2. Create and start container
    await this.createAndStartContainer();
  }

  /**
   * Execute command in Docker container
   */
  async execute(command: string, options: ExecuteOptions = {}): Promise<ExecuteResult> {
    if (!this.containerId) {
      throw new SecurityError('Docker container not initialized');
    }

    const startTime = Date.now();

    try {
      // 1. Check permission
      const permission = await this.permissionManager.checkPermission({
        type: 'bash',
        command,
        workingDir: options.cwd || this.workspaceFolder,
      });

      if (!permission.allowed) {
        throw new PermissionDeniedError(`Command denied: ${command}`, permission.reason);
      }

      // 2. Execute in container
      const result = await this.docker.exec(this.containerId, {
        cmd: ['sh', '-c', command],
        workingDir: options.cwd || this.workspaceFolder,
        env: options.env,
        user: this.config.docker?.user,
      });

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      if (error instanceof PermissionDeniedError || error instanceof SecurityError) {
        throw error;
      }

      throw new ExecutionError(
        `Command failed in Docker container: ${command}`,
        (error as any).exitCode,
        (error as any).stdout,
        (error as any).stderr
      );
    }
  }

  /**
   * Read file from container
   */
  async readFile(filePath: string, _options: FileOptions = {}): Promise<string> {
    if (!this.containerId) {
      throw new SecurityError('Docker container not initialized');
    }

    const containerPath = this.resolveContainerPath(filePath);

    try {
      const result = await this.docker.exec(this.containerId, {
        cmd: ['cat', containerPath],
      });

      if (result.exitCode !== 0) {
        throw new Error(`File not found: ${containerPath}`);
      }

      return result.stdout;
    } catch (error) {
      throw new Error(
        `Failed to read file from container: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Write file to container
   */
  async writeFile(filePath: string, content: string, options: FileOptions = {}): Promise<void> {
    if (!this.containerId) {
      throw new SecurityError('Docker container not initialized');
    }

    const containerPath = this.resolveContainerPath(filePath);

    try {
      // Check permission
      const permission = await this.permissionManager.checkPermission({
        type: 'file_write',
        path: filePath,
      });

      if (!permission.allowed) {
        throw new PermissionDeniedError(`Write denied: ${filePath}`, permission.reason);
      }

      // Create parent directories if needed
      if (options.createDirs) {
        const dir = path.dirname(containerPath);
        await this.docker.exec(this.containerId, {
          cmd: ['mkdir', '-p', dir],
        });
      }

      // Write file
      const result = await this.docker.exec(this.containerId, {
        cmd: ['sh', '-c', `cat > ${containerPath}`],
        stdin: content,
      });

      if (result.exitCode !== 0) {
        throw new Error(`Failed to write file: ${result.stderr}`);
      }
    } catch (error) {
      if (error instanceof PermissionDeniedError || error instanceof SecurityError) {
        throw error;
      }

      throw new Error(
        `Failed to write file to container: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if file exists in container
   */
  async exists(filePath: string): Promise<boolean> {
    if (!this.containerId) {
      throw new SecurityError('Docker container not initialized');
    }

    const containerPath = this.resolveContainerPath(filePath);

    try {
      const result = await this.docker.exec(this.containerId, {
        cmd: ['test', '-e', containerPath],
      });

      return result.exitCode === 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * List directory contents in container
   */
  async listDir(dirPath: string): Promise<string[]> {
    if (!this.containerId) {
      throw new SecurityError('Docker container not initialized');
    }

    const containerPath = this.resolveContainerPath(dirPath);

    try {
      const result = await this.docker.exec(this.containerId, {
        cmd: ['ls', '-1', containerPath],
      });

      if (result.exitCode !== 0) {
        throw new Error(`Directory not found: ${containerPath}`);
      }

      return result.stdout.split('\n').filter((line) => line.trim() !== '');
    } catch (error) {
      throw new Error(
        `Failed to list directory in container: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Delete file in container
   */
  async deleteFile(filePath: string): Promise<void> {
    if (!this.containerId) {
      throw new SecurityError('Docker container not initialized');
    }

    const containerPath = this.resolveContainerPath(filePath);

    try {
      // Check permission
      const permission = await this.permissionManager.checkPermission({
        type: 'file_delete',
        path: filePath,
      });

      if (!permission.allowed) {
        throw new PermissionDeniedError(`Delete denied: ${filePath}`, permission.reason);
      }

      const result = await this.docker.exec(this.containerId, {
        cmd: ['rm', containerPath],
      });

      if (result.exitCode !== 0) {
        throw new Error(`Failed to delete file: ${result.stderr}`);
      }
    } catch (error) {
      if (error instanceof PermissionDeniedError || error instanceof SecurityError) {
        throw error;
      }

      throw new Error(
        `Failed to delete file in container: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Cleanup - stop and remove container (ephemeral)
   */
  async cleanup(): Promise<void> {
    if (!this.containerId) {
      return;
    }

    try {
      // Stop container
      await this.docker.stop(this.containerId, 5);

      // Remove container (ephemeral - always cleanup)
      await this.docker.remove(this.containerId, { force: true, v: true });

      console.log(`Removed Docker container: ${this.containerId}`);
    } catch (error) {
      console.warn(
        `Failed to cleanup container: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get execution mode
   */
  getMode(): ExecutionMode {
    return 'docker';
  }

  /**
   * Get current working directory (container path)
   */
  getCwd(): string {
    return this.workspaceFolder;
  }

  /**
   * Set current working directory (not supported for containers)
   */
  setCwd(_cwd: string): void {
    throw new SecurityError(
      'Cannot change working directory in Docker container. Use execute() with cwd option.'
    );
  }

  /**
   * Build image from Dockerfile
   */
  private async buildImage(dockerfilePath: string): Promise<void> {
    const imageName = `mimir-docker-${path.basename(this.config.projectDir)}`;
    const dockerfileFullPath = path.join(this.config.projectDir, dockerfilePath);
    const dockerfileDir = path.dirname(dockerfileFullPath);

    console.log(`Building Docker image: ${imageName}...`);

    await this.docker.buildImage({
      context: dockerfileDir,
      dockerfile: path.basename(dockerfilePath),
      tag: imageName,
      buildargs: this.config.docker?.buildArgs,
      nocache: this.config.docker?.nocache,
    });

    this.imageName = imageName;
    console.log(`Image built: ${imageName}`);
  }

  /**
   * Pull image from registry
   */
  private async pullImage(image: string): Promise<void> {
    console.log(`Pulling Docker image: ${image}...`);
    await this.docker.pullImage(image);
    console.log(`Image pulled: ${image}`);
  }

  /**
   * Create and start container
   */
  private async createAndStartContainer(): Promise<void> {
    if (!this.imageName) {
      throw new SecurityError('Image not built or pulled');
    }

    const dockerConfig = this.config.docker!;
    const containerName = `mimir-docker-${Date.now()}`;

    // Build create options
    const createOptions: any = {
      name: containerName,
      image: this.imageName,
      workingDir: this.workspaceFolder,
      env: dockerConfig.env ? Object.entries(dockerConfig.env).map(([k, v]) => `${k}=${v}`) : [],
      user: dockerConfig.user,
      hostConfig: {
        // Mount project directory
        binds: [`${this.config.projectDir}:${this.workspaceFolder}`],

        // Network mode
        networkMode: this.getNetworkMode(),

        // Resource limits
        memory: dockerConfig.memoryLimit,
        cpus: dockerConfig.cpuLimit,

        // Readonly filesystem (optional)
        readonly: dockerConfig.readonlyRootfs,

        // Capabilities
        capAdd: dockerConfig.capAdd,
        capDrop: dockerConfig.capDrop || ['ALL'], // Drop all by default
      },
      labels: {
        'mimir.executor': 'docker',
        'mimir.project': path.basename(this.config.projectDir),
      },
    };

    // Disable network if configured
    if (dockerConfig.network === 'disabled') {
      createOptions.networkDisabled = true;
    }

    // Create container
    const container = await this.docker.createContainer(createOptions);
    this.containerId = container.id;

    // Start container
    await this.docker.start(this.containerId);

    console.log(`Created and started Docker container: ${containerName}`);
  }

  /**
   * Get Docker network mode based on config
   */
  private getNetworkMode(): string {
    const network = this.config.docker?.network;

    if (network === 'disabled') {
      return 'none';
    }

    if (network === 'limited') {
      // Limited network - use custom network with filtering
      // TODO: Implement custom network with domain allowlist
      return 'bridge';
    }

    // Full network access
    return 'bridge';
  }

  /**
   * Resolve host path to container path
   */
  private resolveContainerPath(filePath: string): string {
    // If already absolute container path, return as-is
    if (path.isAbsolute(filePath) && filePath.startsWith(this.workspaceFolder)) {
      return filePath;
    }

    // If absolute host path, convert to container path
    if (path.isAbsolute(filePath)) {
      const relativePath = path.relative(this.config.projectDir, filePath);
      return path.join(this.workspaceFolder, relativePath);
    }

    // If relative path, resolve relative to workspace
    return path.join(this.workspaceFolder, filePath);
  }
}
