/**
 * Docker client interface
 *
 * Abstraction over Docker API (dockerode)
 * Provides container lifecycle management and execution
 */

/**
 * Container creation options
 */
export interface ContainerCreateOptions {
  name?: string;
  image: string;
  cmd?: string[];
  entrypoint?: string | string[];
  workingDir?: string;
  env?: string[];
  user?: string;
  hostConfig?: {
    binds?: string[];
    capAdd?: string[];
    capDrop?: string[];
    networkMode?: string;
    memory?: number;
    cpus?: number;
    readonly?: boolean;
  };
  labels?: Record<string, string>;
  networkDisabled?: boolean;
}

/**
 * Container exec options
 */
export interface ContainerExecOptions {
  cmd: string[];
  workingDir?: string;
  env?: Record<string, string>;
  user?: string;
  stdin?: string;
  attachStdin?: boolean;
  attachStdout?: boolean;
  attachStderr?: boolean;
}

/**
 * Container exec result
 */
export interface ContainerExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Container info
 */
export interface ContainerInfo {
  Id: string;
  Name: string;
  Image: string;
  State: string;
  Status: string;
  Created: number;
  Labels?: Record<string, string>;
}

/**
 * Container list filters
 */
export interface ContainerListFilters {
  name?: string[];
  label?: string[];
  status?: string[];
}

/**
 * Container list options
 */
export interface ContainerListOptions {
  all?: boolean;
  limit?: number;
  filters?: ContainerListFilters;
}

/**
 * Image build options
 */
export interface ImageBuildOptions {
  context: string;
  dockerfile?: string;
  tag: string;
  buildargs?: Record<string, string>;
  nocache?: boolean;
}

/**
 * Container creation result
 */
export interface Container {
  id: string;
}

/**
 * Docker client interface
 */
export interface IDockerClient {
  /**
   * List containers
   */
  listContainers(options?: ContainerListOptions): Promise<ContainerInfo[]>;

  /**
   * Create container
   */
  createContainer(options: ContainerCreateOptions): Promise<Container>;

  /**
   * Start container
   */
  start(containerId: string): Promise<void>;

  /**
   * Stop container
   */
  stop(containerId: string, timeout?: number): Promise<void>;

  /**
   * Remove container
   */
  remove(containerId: string, options?: { force?: boolean; v?: boolean }): Promise<void>;

  /**
   * Execute command in container
   */
  exec(containerId: string, options: ContainerExecOptions): Promise<ContainerExecResult>;

  /**
   * Build image from Dockerfile
   */
  buildImage(options: ImageBuildOptions): Promise<void>;

  /**
   * Pull image from registry
   */
  pullImage(image: string, onProgress?: (event: any) => void): Promise<void>;

  /**
   * Inspect container
   */
  inspect(containerId: string): Promise<any>;

  /**
   * Get container logs
   */
  logs(
    containerId: string,
    options?: {
      stdout?: boolean;
      stderr?: boolean;
      follow?: boolean;
      tail?: number;
      since?: number;
    }
  ): Promise<string>;
}
