/**
 * Executor factory - creates appropriate executor based on configuration
 *
 * Auto-detection logic (priority order):
 * 1. Cloud (if cloud config exists)
 * 2. DevContainer (if .devcontainer/devcontainer.json exists)
 * 3. Docker (if Dockerfile or docker-compose.yml exists)
 * 4. Native (fallback - always works)
 */

import path from 'node:path';
import type {
  IFileSystem,
  IProcessExecutor,
  IDockerClient,
  PermissionManagerConfig,
  IExecutor,
  ExecutionConfig,
  ExecutionMode,
} from '@codedir/mimir-agents';
import { ExecutorSecurityError as SecurityError } from '@codedir/mimir-agents';
import type { ITeamsAPIClient } from './CloudExecutor.js';
import { NativeExecutor } from './NativeExecutor.js';
import { DevContainerExecutor } from './DevContainerExecutor.js';
import { DockerExecutor } from './DockerExecutor.js';
import { CloudExecutor } from './CloudExecutor.js';

/**
 * Executor factory dependencies
 */
export interface ExecutorFactoryDependencies {
  /**
   * File system adapter
   */
  fs: IFileSystem;

  /**
   * Process executor
   */
  process: IProcessExecutor;

  /**
   * Docker client (optional - only needed for devcontainer/docker modes)
   */
  docker?: IDockerClient;

  /**
   * Teams API client (optional - only needed for cloud mode)
   */
  teamsClient?: ITeamsAPIClient;

  /**
   * Permission manager configuration (from merged config)
   */
  permissionConfig: PermissionManagerConfig;
}

/**
 * Executor detection result
 */
export interface ExecutorDetectionResult {
  /**
   * Detected mode
   */
  mode: ExecutionMode;

  /**
   * Detection confidence (0-1)
   */
  confidence: number;

  /**
   * Reason for detection
   */
  reason: string;

  /**
   * Config file path (if detected)
   */
  configPath?: string;
}

/**
 * Executor factory
 */
export class ExecutorFactory {
  constructor(private deps: ExecutorFactoryDependencies) {}

  /**
   * Create executor based on configuration
   */
  async create(config: ExecutionConfig): Promise<IExecutor> {
    // Determine execution mode
    const mode = await this.resolveMode(config);

    // Create executor based on mode
    switch (mode) {
      case 'cloud':
        return this.createCloudExecutor(config);

      case 'devcontainer':
        return this.createDevContainerExecutor(config);

      case 'docker':
        return this.createDockerExecutor(config);

      case 'native':
        return this.createNativeExecutor(config);

      default:
        throw new SecurityError(`Unknown execution mode: ${mode}`);
    }
  }

  /**
   * Detect available execution modes
   */
  async detectAvailableModes(projectDir: string): Promise<ExecutorDetectionResult[]> {
    const results: ExecutorDetectionResult[] = [];

    // Check for cloud config
    const cloudResult = await this.detectCloudMode(projectDir);
    if (cloudResult) {
      results.push(cloudResult);
    }

    // Check for dev container
    const devContainerResult = await this.detectDevContainerMode(projectDir);
    if (devContainerResult) {
      results.push(devContainerResult);
    }

    // Check for Docker
    const dockerResult = await this.detectDockerMode(projectDir);
    if (dockerResult) {
      results.push(dockerResult);
    }

    // Native is always available
    results.push({
      mode: 'native',
      confidence: 1.0,
      reason: 'Native execution always available',
    });

    return results;
  }

  /**
   * Recommend best execution mode
   */
  async recommendMode(config: ExecutionConfig): Promise<ExecutorDetectionResult> {
    // If mode explicitly set, return it
    if (config.mode !== 'auto') {
      return {
        mode: config.mode,
        confidence: 1.0,
        reason: 'Explicitly configured',
      };
    }

    // Auto-detect
    const available = await this.detectAvailableModes(config.projectDir);

    // Priority order: cloud > devcontainer > docker > native
    if (available.length > 0) {
      // Return highest priority mode
      return available[0]!;
    }

    // Fallback to native
    return {
      mode: 'native',
      confidence: 1.0,
      reason: 'Fallback to native execution',
    };
  }

  /**
   * Detect best execution mode for a project directory (convenience method)
   * @deprecated Use detectAvailableModes() or recommendMode() instead
   */
  async detect(projectDir: string): Promise<ExecutorDetectionResult & { available: boolean }> {
    const available = await this.detectAvailableModes(projectDir);

    // Return the highest priority mode
    const best = available[0] ?? {
      mode: 'native' as ExecutionMode,
      confidence: 1.0,
      reason: 'Fallback to native execution',
    };

    return {
      ...best,
      available: true,
    };
  }

  /**
   * Create executor (convenience method alias)
   * @deprecated Use create() instead
   */
  async createExecutor(config: ExecutionConfig): Promise<IExecutor> {
    return this.create(config);
  }

  /**
   * Resolve execution mode (handle 'auto')
   */
  private async resolveMode(config: ExecutionConfig): Promise<ExecutionMode> {
    if (config.mode === 'auto') {
      const recommended = await this.recommendMode(config);
      return recommended.mode;
    }

    return config.mode;
  }

  /**
   * Detect cloud mode
   */
  private async detectCloudMode(projectDir: string): Promise<ExecutorDetectionResult | null> {
    // Check for .mimir/cloud.yml or cloud config in config.yml
    const cloudConfigPath = path.join(projectDir, '.mimir', 'cloud.yml');
    const configPath = path.join(projectDir, '.mimir', 'config.yml');

    try {
      if (await this.deps.fs.exists(cloudConfigPath)) {
        return {
          mode: 'cloud',
          confidence: 1.0,
          reason: 'Cloud configuration file found',
          configPath: cloudConfigPath,
        };
      }

      if (await this.deps.fs.exists(configPath)) {
        const content = await this.deps.fs.readFile(configPath, 'utf-8');
        if (content.includes('cloud:') || content.includes('execution:\n  mode: cloud')) {
          return {
            mode: 'cloud',
            confidence: 0.9,
            reason: 'Cloud config detected in config.yml',
            configPath,
          };
        }
      }
    } catch (error) {
      // Ignore errors
    }

    return null;
  }

  /**
   * Detect dev container mode
   */
  private async detectDevContainerMode(
    projectDir: string
  ): Promise<ExecutorDetectionResult | null> {
    // Check for .devcontainer/devcontainer.json
    const devContainerPath = path.join(projectDir, '.devcontainer', 'devcontainer.json');

    try {
      if (await this.deps.fs.exists(devContainerPath)) {
        return {
          mode: 'devcontainer',
          confidence: 1.0,
          reason: 'Dev container configuration found',
          configPath: devContainerPath,
        };
      }
    } catch (error) {
      // Ignore errors
    }

    return null;
  }

  /**
   * Detect Docker mode
   */
  private async detectDockerMode(projectDir: string): Promise<ExecutorDetectionResult | null> {
    // Check for Dockerfile or docker-compose.yml
    const dockerfilePath = path.join(projectDir, 'Dockerfile');
    const composePathYml = path.join(projectDir, 'docker-compose.yml');
    const composePathYaml = path.join(projectDir, 'docker-compose.yaml');

    try {
      if (await this.deps.fs.exists(dockerfilePath)) {
        return {
          mode: 'docker',
          confidence: 1.0,
          reason: 'Dockerfile found',
          configPath: dockerfilePath,
        };
      }

      if (await this.deps.fs.exists(composePathYml)) {
        return {
          mode: 'docker',
          confidence: 1.0,
          reason: 'docker-compose.yml found',
          configPath: composePathYml,
        };
      }

      if (await this.deps.fs.exists(composePathYaml)) {
        return {
          mode: 'docker',
          confidence: 1.0,
          reason: 'docker-compose.yaml found',
          configPath: composePathYaml,
        };
      }
    } catch (error) {
      // Ignore errors
    }

    return null;
  }

  /**
   * Create native executor
   */
  private createNativeExecutor(config: ExecutionConfig): NativeExecutor {
    return new NativeExecutor(this.deps.fs, this.deps.process, this.deps.permissionConfig, config);
  }

  /**
   * Create dev container executor
   */
  private createDevContainerExecutor(config: ExecutionConfig): DevContainerExecutor {
    if (!this.deps.docker) {
      throw new SecurityError('Docker client required for DevContainer mode');
    }

    return new DevContainerExecutor(
      this.deps.fs,
      this.deps.process,
      this.deps.docker,
      this.deps.permissionConfig,
      config
    );
  }

  /**
   * Create Docker executor
   */
  private createDockerExecutor(config: ExecutionConfig): DockerExecutor {
    if (!this.deps.docker) {
      throw new SecurityError('Docker client required for Docker mode');
    }

    return new DockerExecutor(
      this.deps.fs,
      this.deps.process,
      this.deps.docker,
      this.deps.permissionConfig,
      config
    );
  }

  /**
   * Create cloud executor
   */
  private createCloudExecutor(config: ExecutionConfig): CloudExecutor {
    if (!this.deps.teamsClient) {
      throw new SecurityError('Teams API client required for Cloud mode');
    }

    return new CloudExecutor(
      this.deps.fs,
      this.deps.process,
      this.deps.teamsClient,
      this.deps.permissionConfig,
      config
    );
  }
}

/**
 * Convenience function to create executor factory
 */
export function createExecutorFactory(deps: ExecutorFactoryDependencies): ExecutorFactory {
  return new ExecutorFactory(deps);
}

/**
 * Convenience function to create executor
 */
export async function createExecutor(
  config: ExecutionConfig,
  deps: ExecutorFactoryDependencies
): Promise<IExecutor> {
  const factory = new ExecutorFactory(deps);
  return factory.create(config);
}
