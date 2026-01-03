/**
 * Permission system types
 */

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskAssessment {
  level: RiskLevel;
  reasons: string[];
  score: number; // 0-100, higher = more risky
}

export interface PermissionRequest {
  type: 'bash' | 'file_write' | 'file_read' | 'file_delete';
  command?: string;
  path?: string;
  workingDir?: string;
}

export interface PermissionResult {
  allowed: boolean;
  reason: string;
  riskLevel: RiskLevel;
  assessment: RiskAssessment;
}

export interface PermissionManagerConfig {
  /** Commands/patterns always allowed (merged allowlist from local + Teams) */
  allowlist: string[];

  /** Commands/patterns always blocked (from Teams enforcement) */
  blocklist: string[];

  /** Auto-accept commands up to this risk level */
  acceptRiskLevel: RiskLevel;

  /** Enable auto-accept (if false, all commands require approval) */
  autoAccept: boolean;

  /** Optional audit logger */
  auditLogger?: IAuditLogger;
}

export interface AuditLogEntry {
  timestamp: Date;
  type: 'bash' | 'file_read' | 'file_write' | 'file_delete';
  operation: string;
  result: 'allowed' | 'denied';
  riskLevel: RiskLevel;
  reason: string;
  duration?: number;
  exitCode?: number;
  error?: string;
}

export interface IAuditLogger {
  log(entry: AuditLogEntry): Promise<void>;
}
