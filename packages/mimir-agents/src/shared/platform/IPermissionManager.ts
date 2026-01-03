/**
 * Permission manager interface (platform abstraction)
 * Implementation will be provided by the main CLI when using this package
 */

export interface PermissionRequest {
  type: 'bash' | 'file_write' | 'file_read' | 'file_delete' | string;
  command?: string;
  path?: string;
  workingDir?: string;
  [key: string]: unknown;
}

export interface PermissionResult {
  allowed: boolean;
  reason?: string;
}

export interface IPermissionManager {
  checkPermission(request: PermissionRequest): Promise<PermissionResult>;
}
