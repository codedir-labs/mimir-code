/**
 * Permissions feature - Permission system and risk assessment
 * Re-exports from @codedir/mimir-agents package
 */

export { PermissionManager, RiskAssessor } from '@codedir/mimir-agents/core';
export type {
  RiskLevel,
  RiskAssessment,
  PermissionRequest,
  PermissionResult,
  PermissionManagerConfig,
  AuditLogEntry,
  IAuditLogger,
} from '@codedir/mimir-agents/core';
