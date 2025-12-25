/**
 * Platform-agnostic Docker client interface
 * Implementation will use dockerode
 */

export interface RunOptions {
  image: string;
  command: string[];
  workingDir?: string;
  env?: Record<string, string>;
  binds?: string[]; // Volume mounts ["host:container"]
  readOnly?: boolean;
  cpuLimit?: number;
  memoryLimit?: string; // e.g., "512m"
  timeout?: number;
  networkMode?: 'bridge' | 'host' | 'none';
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export interface BuildOptions {
  context: string;
  dockerfile?: string;
  tag: string;
  platform?: string;
}

export interface IDockerClient {
  /**
   * Check if Docker is available
   */
  isAvailable(): Promise<boolean>;

  /**
   * Build Docker image
   */
  build(options: BuildOptions): Promise<void>;

  /**
   * Run command in container
   */
  run(options: RunOptions): Promise<RunResult>;

  /**
   * Pull image from registry
   */
  pull(image: string): Promise<void>;

  /**
   * List images
   */
  listImages(): Promise<string[]>;

  /**
   * Remove container
   */
  cleanup(containerId: string): Promise<void>;

  /**
   * Remove image
   */
  removeImage(imageId: string): Promise<void>;
}
