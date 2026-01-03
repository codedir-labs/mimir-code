/**
 * Cloud executor - runs commands in Teams/Enterprise cloud VMs
 *
 * Features:
 * - Provision VMs via Teams API
 * - Execute in isolated cloud environments
 * - Network proxy with domain allowlisting
 * - Centralized audit logs
 * - Resource quota management
 */

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
 * Teams API client interface (imported from features/teams)
 */
export interface ITeamsAPIClient {
  /**
   * Provision a new cloud VM
   */
  provisionVM(config: VMProvisionConfig): Promise<CloudVM>;

  /**
   * Execute command in cloud VM
   */
  executeCommand(vmId: string, command: string, options?: ExecuteOptions): Promise<ExecuteResult>;

  /**
   * Read file from cloud VM
   */
  readFile(vmId: string, filePath: string): Promise<string>;

  /**
   * Write file to cloud VM
   */
  writeFile(vmId: string, filePath: string, content: string): Promise<void>;

  /**
   * Check if file exists in cloud VM
   */
  fileExists(vmId: string, filePath: string): Promise<boolean>;

  /**
   * List directory in cloud VM
   */
  listDirectory(vmId: string, dirPath: string): Promise<string[]>;

  /**
   * Delete file in cloud VM
   */
  deleteFile(vmId: string, filePath: string): Promise<void>;

  /**
   * Upload project files to cloud VM
   */
  uploadProject(vmId: string, projectDir: string): Promise<void>;

  /**
   * Download files from cloud VM
   */
  downloadFiles(vmId: string, paths: string[], localDir: string): Promise<void>;

  /**
   * Destroy cloud VM
   */
  destroyVM(vmId: string): Promise<void>;

  /**
   * Get VM status
   */
  getVMStatus(vmId: string): Promise<VMStatus>;

  /**
   * Log audit event
   */
  logAudit(event: AuditEvent): Promise<void>;
}

/**
 * VM provision configuration
 */
export interface VMProvisionConfig {
  /**
   * Organization ID
   */
  orgId: string;

  /**
   * VM size
   */
  size: 'standard' | 'large' | 'xlarge';

  /**
   * Cloud region
   */
  region?: string;

  /**
   * Network mode
   */
  network: 'disabled' | 'limited' | 'full';

  /**
   * Allowed domains (if network = limited)
   */
  allowedDomains?: string[];

  /**
   * Session timeout (seconds)
   */
  sessionTimeout?: number;

  /**
   * Project metadata
   */
  metadata?: {
    projectName?: string;
    userId?: string;
    sessionId?: string;
  };
}

/**
 * Cloud VM
 */
export interface CloudVM {
  /**
   * VM ID
   */
  id: string;

  /**
   * VM status
   */
  status: VMStatus;

  /**
   * IP address
   */
  ipAddress?: string;

  /**
   * Created at
   */
  createdAt: Date;

  /**
   * Workspace directory
   */
  workspaceDir: string;
}

/**
 * VM status
 */
export type VMStatus = 'provisioning' | 'running' | 'stopped' | 'terminated' | 'error';

/**
 * Audit event
 */
export interface AuditEvent {
  /**
   * Event type
   */
  type: 'command' | 'file_read' | 'file_write' | 'file_delete' | 'permission_check';

  /**
   * VM ID
   */
  vmId: string;

  /**
   * User ID
   */
  userId?: string;

  /**
   * Session ID
   */
  sessionId?: string;

  /**
   * Event details
   */
  details: Record<string, any>;

  /**
   * Timestamp
   */
  timestamp: Date;

  /**
   * Result (success/failure)
   */
  result: 'success' | 'failure';

  /**
   * Error message (if failed)
   */
  error?: string;
}

/**
 * Cloud executor implementation
 */
export class CloudExecutor implements IExecutor {
  private vm?: CloudVM;
  private sessionId: string;
  private permissionManager: PermissionManager;

  constructor(
    _fs: IFileSystem,
    _process: IProcessExecutor,
    private teamsClient: ITeamsAPIClient,
    permissionConfig: PermissionManagerConfig,
    private config: ExecutionConfig
  ) {
    this.sessionId = `session-${Date.now()}`;
    this.permissionManager = new PermissionManager(permissionConfig);
  }

  /**
   * Initialize cloud VM
   */
  async initialize(): Promise<void> {
    if (!this.config.cloud) {
      throw new SecurityError('Cloud configuration not provided');
    }

    const cloudConfig = this.config.cloud;

    console.log('Provisioning cloud VM...');

    try {
      // Provision VM
      this.vm = await this.teamsClient.provisionVM({
        orgId: cloudConfig.orgId,
        size: cloudConfig.vmSize || 'standard',
        region: cloudConfig.region,
        network: cloudConfig.network || 'limited',
        allowedDomains: cloudConfig.allowedDomains,
        sessionTimeout: cloudConfig.sessionTimeout,
        metadata: {
          projectName: this.config.projectDir.split(/[/\\]/).pop(),
          sessionId: this.sessionId,
        },
      });

      console.log(`Cloud VM provisioned: ${this.vm.id}`);

      // Wait for VM to be running
      await this.waitForVMReady();

      console.log('Cloud VM ready');

      // Upload project files
      console.log('Uploading project files...');
      await this.teamsClient.uploadProject(this.vm.id, this.config.projectDir);
      console.log('Project files uploaded');

      // Log audit event
      await this.logAudit({
        type: 'command',
        details: {
          action: 'vm_initialized',
          vmId: this.vm.id,
          size: cloudConfig.vmSize || 'standard',
        },
        result: 'success',
      });
    } catch (error) {
      await this.logAudit({
        type: 'command',
        details: {
          action: 'vm_initialization_failed',
        },
        result: 'failure',
        error: error instanceof Error ? error.message : String(error),
      });

      throw new ExecutionError(
        `Failed to provision cloud VM: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Execute command in cloud VM
   */
  async execute(command: string, options: ExecuteOptions = {}): Promise<ExecuteResult> {
    if (!this.vm) {
      throw new SecurityError('Cloud VM not initialized');
    }

    const startTime = Date.now();

    try {
      // 1. Check permission
      const permission = await this.permissionManager.checkPermission({
        type: 'bash',
        command,
        workingDir: options.cwd || this.vm.workspaceDir,
      });

      if (!permission.allowed) {
        await this.logAudit({
          type: 'permission_check',
          details: {
            command,
            reason: permission.reason,
          },
          result: 'failure',
          error: 'Permission denied',
        });

        throw new PermissionDeniedError(`Command denied: ${command}`, permission.reason);
      }

      // 2. Execute in cloud VM via API
      const result = await this.teamsClient.executeCommand(this.vm.id, command, options);

      // 3. Log audit event
      await this.logAudit({
        type: 'command',
        details: {
          command,
          exitCode: result.exitCode,
          duration: Date.now() - startTime,
        },
        result: result.exitCode === 0 ? 'success' : 'failure',
      });

      return result;
    } catch (error) {
      if (error instanceof PermissionDeniedError || error instanceof SecurityError) {
        throw error;
      }

      await this.logAudit({
        type: 'command',
        details: {
          command,
        },
        result: 'failure',
        error: error instanceof Error ? error.message : String(error),
      });

      throw new ExecutionError(
        `Command failed in cloud VM: ${command}`,
        (error as any).exitCode,
        (error as any).stdout,
        (error as any).stderr
      );
    }
  }

  /**
   * Read file from cloud VM
   */
  async readFile(filePath: string, _options: FileOptions = {}): Promise<string> {
    if (!this.vm) {
      throw new SecurityError('Cloud VM not initialized');
    }

    try {
      const content = await this.teamsClient.readFile(this.vm.id, filePath);

      await this.logAudit({
        type: 'file_read',
        details: {
          filePath,
        },
        result: 'success',
      });

      return content;
    } catch (error) {
      await this.logAudit({
        type: 'file_read',
        details: {
          filePath,
        },
        result: 'failure',
        error: error instanceof Error ? error.message : String(error),
      });

      throw new Error(
        `Failed to read file from cloud VM: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Write file to cloud VM
   */
  async writeFile(filePath: string, content: string, _options: FileOptions = {}): Promise<void> {
    if (!this.vm) {
      throw new SecurityError('Cloud VM not initialized');
    }

    try {
      // Check permission
      const permission = await this.permissionManager.checkPermission({
        type: 'file_write',
        path: filePath,
      });

      if (!permission.allowed) {
        await this.logAudit({
          type: 'permission_check',
          details: {
            filePath,
            reason: permission.reason,
          },
          result: 'failure',
          error: 'Permission denied',
        });

        throw new PermissionDeniedError(`Write denied: ${filePath}`, permission.reason);
      }

      await this.teamsClient.writeFile(this.vm.id, filePath, content);

      await this.logAudit({
        type: 'file_write',
        details: {
          filePath,
          size: content.length,
        },
        result: 'success',
      });
    } catch (error) {
      if (error instanceof PermissionDeniedError || error instanceof SecurityError) {
        throw error;
      }

      await this.logAudit({
        type: 'file_write',
        details: {
          filePath,
        },
        result: 'failure',
        error: error instanceof Error ? error.message : String(error),
      });

      throw new Error(
        `Failed to write file to cloud VM: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Check if file exists in cloud VM
   */
  async exists(filePath: string): Promise<boolean> {
    if (!this.vm) {
      throw new SecurityError('Cloud VM not initialized');
    }

    try {
      return await this.teamsClient.fileExists(this.vm.id, filePath);
    } catch (error) {
      return false;
    }
  }

  /**
   * List directory in cloud VM
   */
  async listDir(dirPath: string): Promise<string[]> {
    if (!this.vm) {
      throw new SecurityError('Cloud VM not initialized');
    }

    try {
      return await this.teamsClient.listDirectory(this.vm.id, dirPath);
    } catch (error) {
      throw new Error(
        `Failed to list directory in cloud VM: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Delete file in cloud VM
   */
  async deleteFile(filePath: string): Promise<void> {
    if (!this.vm) {
      throw new SecurityError('Cloud VM not initialized');
    }

    try {
      // Check permission
      const permission = await this.permissionManager.checkPermission({
        type: 'file_delete',
        path: filePath,
      });

      if (!permission.allowed) {
        await this.logAudit({
          type: 'permission_check',
          details: {
            filePath,
            reason: permission.reason,
          },
          result: 'failure',
          error: 'Permission denied',
        });

        throw new PermissionDeniedError(`Delete denied: ${filePath}`, permission.reason);
      }

      await this.teamsClient.deleteFile(this.vm.id, filePath);

      await this.logAudit({
        type: 'file_delete',
        details: {
          filePath,
        },
        result: 'success',
      });
    } catch (error) {
      if (error instanceof PermissionDeniedError || error instanceof SecurityError) {
        throw error;
      }

      await this.logAudit({
        type: 'file_delete',
        details: {
          filePath,
        },
        result: 'failure',
        error: error instanceof Error ? error.message : String(error),
      });

      throw new Error(
        `Failed to delete file in cloud VM: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Cleanup - destroy cloud VM
   */
  async cleanup(): Promise<void> {
    if (!this.vm) {
      return;
    }

    try {
      console.log(`Destroying cloud VM: ${this.vm.id}...`);
      await this.teamsClient.destroyVM(this.vm.id);
      console.log(`Cloud VM destroyed: ${this.vm.id}`);

      await this.logAudit({
        type: 'command',
        details: {
          action: 'vm_destroyed',
          vmId: this.vm.id,
        },
        result: 'success',
      });
    } catch (error) {
      console.warn(
        `Failed to destroy cloud VM: ${error instanceof Error ? error.message : String(error)}`
      );

      await this.logAudit({
        type: 'command',
        details: {
          action: 'vm_destruction_failed',
          vmId: this.vm.id,
        },
        result: 'failure',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get execution mode
   */
  getMode(): ExecutionMode {
    return 'cloud';
  }

  /**
   * Get current working directory (cloud VM path)
   */
  getCwd(): string {
    return this.vm?.workspaceDir || '/workspace';
  }

  /**
   * Set current working directory (not supported for cloud VMs)
   */
  setCwd(_cwd: string): void {
    throw new SecurityError(
      'Cannot change working directory in cloud VM. Use execute() with cwd option.'
    );
  }

  /**
   * Wait for VM to be ready
   */
  private async waitForVMReady(): Promise<void> {
    if (!this.vm) {
      throw new SecurityError('VM not provisioned');
    }

    const maxAttempts = 60; // 60 attempts * 2s = 2 minutes max
    const pollInterval = 2000; // 2 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.teamsClient.getVMStatus(this.vm.id);

      if (status === 'running') {
        return;
      }

      if (status === 'error' || status === 'terminated') {
        throw new ExecutionError(`VM failed to start: ${status}`);
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new ExecutionError('VM provisioning timeout (2 minutes)');
  }

  /**
   * Log audit event
   */
  private async logAudit(event: Partial<AuditEvent>): Promise<void> {
    try {
      await this.teamsClient.logAudit({
        type: event.type!,
        vmId: this.vm?.id || 'unknown',
        sessionId: this.sessionId,
        details: event.details || {},
        timestamp: new Date(),
        result: event.result!,
        error: event.error,
      });
    } catch (error) {
      // Log audit failures to console but don't throw
      console.warn(
        `Failed to log audit event: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
