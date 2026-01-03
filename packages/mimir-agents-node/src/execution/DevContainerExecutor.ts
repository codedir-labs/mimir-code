/**
 * Dev Container executor - runs commands in user's dev container
 *
 * Features:
 * - Auto-detects .devcontainer/devcontainer.json
 * - Uses existing dev container setup (no custom images)
 * - Supports Docker Compose configurations
 * - Fast startup (cached containers)
 * - Volume mounts for file operations
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
 * Dev container configuration (subset of devcontainer.json spec)
 */
interface DevContainerConfig {
  name?: string;
  image?: string;
  dockerFile?: string;
  dockerComposeFile?: string | string[];
  service?: string;
  workspaceFolder?: string;
  workspaceMount?: string;
  mounts?: string[];
  runArgs?: string[];
  containerEnv?: Record<string, string>;
  remoteUser?: string;
  features?: Record<string, any>;
  postCreateCommand?: string;
  postStartCommand?: string;
}

/**
 * Container state
 */
interface ContainerState {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'paused';
  image: string;
}

/**
 * Dev container executor implementation
 */
export class DevContainerExecutor implements IExecutor {
  private containerId?: string;
  private containerName?: string;
  private devContainerConfig?: DevContainerConfig;
  private workspaceFolder: string;

  constructor(
    private fs: IFileSystem,
    _process: IProcessExecutor,
    private docker: IDockerClient,
    permissionConfig: PermissionManagerConfig,
    private config: ExecutionConfig
  ) {
    this.workspaceFolder = config.devcontainer?.workspaceFolder || '/workspace';
    this.permissionManager = new PermissionManager(permissionConfig);
  }

  private permissionManager: PermissionManager;

  /**
   * Initialize dev container
   */
  async initialize(): Promise<void> {
    // 1. Auto-detect or use configured dev container
    const configPath = await this.findDevContainerConfig();
    if (!configPath) {
      throw new SecurityError(
        'No .devcontainer/devcontainer.json found. Use native mode or provide devcontainer config.'
      );
    }

    // 2. Parse dev container configuration
    this.devContainerConfig = await this.parseDevContainerConfig(configPath);

    // 3. Check if container already running
    const existingContainer = await this.findExistingContainer();
    if (existingContainer?.status === 'running') {
      this.containerId = existingContainer.id;
      this.containerName = existingContainer.name;
      console.log(`Using existing dev container: ${this.containerName}`);
      return;
    }

    // 4. Start or create container
    if (existingContainer?.status === 'stopped') {
      await this.startContainer(existingContainer.id);
    } else {
      await this.createAndStartContainer();
    }

    // 5. Run post-create/post-start commands
    await this.runLifecycleCommands();
  }

  /**
   * Execute command in dev container
   */
  async execute(command: string, options: ExecuteOptions = {}): Promise<ExecuteResult> {
    if (!this.containerId) {
      throw new SecurityError('Dev container not initialized');
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
        user: this.devContainerConfig?.remoteUser,
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
        `Command failed in dev container: ${command}`,
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
      throw new SecurityError('Dev container not initialized');
    }

    const containerPath = this.resolveContainerPath(filePath);

    try {
      // Use docker cp to read file
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
      throw new SecurityError('Dev container not initialized');
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

      // Write file using docker exec with heredoc
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
      throw new SecurityError('Dev container not initialized');
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
      throw new SecurityError('Dev container not initialized');
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
      throw new SecurityError('Dev container not initialized');
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
   * Cleanup - stop container if configured
   */
  async cleanup(): Promise<void> {
    // By default, keep container running for reuse
    // Only stop if explicitly configured
    if (this.config.devcontainer?.stopOnExit && this.containerId) {
      await this.docker.stop(this.containerId);
      console.log(`Stopped dev container: ${this.containerName}`);
    }
  }

  /**
   * Get execution mode
   */
  getMode(): ExecutionMode {
    return 'devcontainer';
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
    // Dev containers use fixed workspace folder
    throw new SecurityError(
      'Cannot change working directory in dev container. Use execute() with cwd option.'
    );
  }

  /**
   * Find dev container configuration file
   */
  private async findDevContainerConfig(): Promise<string | null> {
    // Check configured path
    if (this.config.devcontainer?.configPath) {
      const exists = await this.fs.exists(this.config.devcontainer.configPath);
      if (exists) {
        return this.config.devcontainer.configPath;
      }
    }

    // Auto-detect common locations
    const candidates = [
      path.join(this.config.projectDir, '.devcontainer', 'devcontainer.json'),
      path.join(this.config.projectDir, '.devcontainer.json'),
    ];

    for (const candidate of candidates) {
      const exists = await this.fs.exists(candidate);
      if (exists) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Parse dev container configuration
   */
  private async parseDevContainerConfig(configPath: string): Promise<DevContainerConfig> {
    const content = await this.fs.readFile(configPath, 'utf-8');
    const contentStr = typeof content === 'string' ? content : content.toString();

    try {
      // Remove JSON comments (// and /* */)
      const jsonContent = contentStr
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ comments
        .replace(/\/\/.*/g, ''); // Remove // comments

      const config = JSON.parse(jsonContent) as DevContainerConfig;

      // Validate required fields
      if (!config.image && !config.dockerFile && !config.dockerComposeFile) {
        throw new Error(
          'Dev container config must specify image, dockerFile, or dockerComposeFile'
        );
      }

      return config;
    } catch (error) {
      throw new SecurityError(
        `Failed to parse devcontainer.json: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Find existing container
   */
  private async findExistingContainer(): Promise<ContainerState | null> {
    const containerName = this.getContainerName();

    try {
      const containers = await this.docker.listContainers({
        all: true,
        filters: { name: [containerName] },
      });

      if (containers.length === 0) {
        return null;
      }

      const container = containers[0]!;
      return {
        id: container.Id,
        name: containerName,
        status: container.State as 'running' | 'stopped' | 'paused',
        image: container.Image,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Start existing container
   */
  private async startContainer(containerId: string): Promise<void> {
    await this.docker.start(containerId);
    this.containerId = containerId;
    this.containerName = this.getContainerName();
    console.log(`Started existing dev container: ${this.containerName}`);
  }

  /**
   * Create and start new container
   */
  private async createAndStartContainer(): Promise<void> {
    if (!this.devContainerConfig) {
      throw new SecurityError('Dev container config not loaded');
    }

    const containerName = this.getContainerName();
    const config = this.devContainerConfig;

    // Build or pull image if needed
    if (config.dockerFile) {
      await this.buildImage(config.dockerFile);
    } else if (config.image) {
      await this.pullImage(config.image);
    }

    // Create container
    const createOptions: any = {
      name: containerName,
      image: config.image || `mimir-devcontainer-${path.basename(this.config.projectDir)}`,
      workingDir: config.workspaceFolder || this.workspaceFolder,
      env: config.containerEnv
        ? Object.entries(config.containerEnv).map(([k, v]) => `${k}=${v}`)
        : [],
      hostConfig: {
        binds: [
          // Mount project directory
          `${this.config.projectDir}:${config.workspaceFolder || this.workspaceFolder}`,
          // Additional mounts
          ...(config.mounts || []),
        ],
      },
      user: config.remoteUser,
    };

    // Add run args
    if (config.runArgs) {
      // Parse run args (simplified, proper parsing would be more complex)
      config.runArgs.forEach((arg) => {
        if (arg.startsWith('--cap-add=')) {
          createOptions.hostConfig.capAdd = createOptions.hostConfig.capAdd || [];
          createOptions.hostConfig.capAdd.push(arg.split('=')[1]);
        }
      });
    }

    const container = await this.docker.createContainer(createOptions);
    await this.docker.start(container.id);

    this.containerId = container.id;
    this.containerName = containerName;

    console.log(`Created and started dev container: ${containerName}`);
  }

  /**
   * Build image from Dockerfile
   */
  private async buildImage(dockerfilePath: string): Promise<void> {
    const imageName = `mimir-devcontainer-${path.basename(this.config.projectDir)}`;
    const dockerfileDir = path.dirname(path.join(this.config.projectDir, dockerfilePath));

    console.log(`Building dev container image: ${imageName}...`);

    await this.docker.buildImage({
      context: dockerfileDir,
      dockerfile: path.basename(dockerfilePath),
      tag: imageName,
    });

    // Update config with built image name
    if (this.devContainerConfig) {
      this.devContainerConfig.image = imageName;
    }
  }

  /**
   * Pull image from registry
   */
  private async pullImage(image: string): Promise<void> {
    console.log(`Pulling dev container image: ${image}...`);
    await this.docker.pullImage(image);
  }

  /**
   * Run lifecycle commands (postCreateCommand, postStartCommand)
   */
  private async runLifecycleCommands(): Promise<void> {
    if (!this.devContainerConfig || !this.containerId) {
      return;
    }

    // Run postCreateCommand (only on first create)
    if (this.devContainerConfig.postCreateCommand) {
      console.log('Running postCreateCommand...');
      await this.docker.exec(this.containerId, {
        cmd: ['sh', '-c', this.devContainerConfig.postCreateCommand],
      });
    }

    // Run postStartCommand (every start)
    if (this.devContainerConfig.postStartCommand) {
      console.log('Running postStartCommand...');
      await this.docker.exec(this.containerId, {
        cmd: ['sh', '-c', this.devContainerConfig.postStartCommand],
      });
    }
  }

  /**
   * Get container name (based on project directory)
   */
  private getContainerName(): string {
    const projectName = path.basename(this.config.projectDir);
    return `mimir-devcontainer-${projectName}`;
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
