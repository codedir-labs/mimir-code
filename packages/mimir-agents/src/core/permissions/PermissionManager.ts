/**
 * Permission manager for command execution
 *
 * Responsibilities:
 * - Assess risk of commands
 * - Check allowlist/blocklist
 * - Determine if command should be allowed based on risk level
 * - Optional audit logging
 *
 * Does NOT handle:
 * - User prompts (CLI's responsibility)
 * - Config loading (CLI passes merged config)
 */

import { RiskAssessor } from './RiskAssessor.js';
import type {
  PermissionManagerConfig,
  PermissionRequest,
  PermissionResult,
  RiskLevel,
  AuditLogEntry,
} from './types.js';

export class PermissionManager {
  private riskAssessor: RiskAssessor;
  private config: PermissionManagerConfig;

  constructor(config: PermissionManagerConfig) {
    this.config = config;
    this.riskAssessor = new RiskAssessor();
  }

  async checkPermission(request: PermissionRequest): Promise<PermissionResult> {
    const operation = this.getOperation(request);

    // 1. Assess risk
    const assessment = this.riskAssessor.assess(operation);

    // 2. Check blocklist (highest priority - always deny)
    if (this.isBlocked(operation)) {
      await this.audit({
        type: request.type,
        operation,
        result: 'denied',
        riskLevel: assessment.level,
        reason: 'Blocked by policy',
      });
      return {
        allowed: false,
        reason: 'Command is blocked by security policy',
        riskLevel: assessment.level,
        assessment,
      };
    }

    // 3. Check allowlist (always allow if matched)
    if (this.isAllowed(operation)) {
      await this.audit({
        type: request.type,
        operation,
        result: 'allowed',
        riskLevel: assessment.level,
        reason: 'In allowlist',
      });
      return {
        allowed: true,
        reason: 'Command is in allowlist',
        riskLevel: assessment.level,
        assessment,
      };
    }

    // 4. Check risk level acceptance (auto-accept if within threshold)
    if (this.config.autoAccept && this.isRiskAcceptable(assessment.level)) {
      await this.audit({
        type: request.type,
        operation,
        result: 'allowed',
        riskLevel: assessment.level,
        reason: `Auto-accepted (risk: ${assessment.level})`,
      });
      return {
        allowed: true,
        reason: `Auto-accepted (risk level: ${assessment.level})`,
        riskLevel: assessment.level,
        assessment,
      };
    }

    // 5. Requires approval (CLI will handle prompting user)
    await this.audit({
      type: request.type,
      operation,
      result: 'denied',
      riskLevel: assessment.level,
      reason: `Requires approval (risk: ${assessment.level})`,
    });
    return {
      allowed: false,
      reason: `Command requires approval (risk level: ${assessment.level})`,
      riskLevel: assessment.level,
      assessment,
    };
  }

  /**
   * Check if command matches blocklist patterns
   */
  private isBlocked(command: string): boolean {
    return this.config.blocklist.some((pattern) => this.matchPattern(command, pattern));
  }

  /**
   * Check if command matches allowlist patterns
   */
  private isAllowed(command: string): boolean {
    return this.config.allowlist.some((pattern) => this.matchPattern(command, pattern));
  }

  /**
   * Check if risk level is acceptable for auto-approval
   */
  private isRiskAcceptable(level: RiskLevel): boolean {
    const levels: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
    const commandLevel = levels.indexOf(level);
    const acceptLevel = levels.indexOf(this.config.acceptRiskLevel);
    return commandLevel <= acceptLevel;
  }

  /**
   * Simple pattern matching (exact match or prefix with *)
   */
  private matchPattern(command: string, pattern: string): boolean {
    // Exact match
    if (command === pattern) {
      return true;
    }

    // Wildcard pattern (e.g., "git *", "npm install *")
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1).trim();
      return command.startsWith(prefix);
    }

    // Regex pattern (if starts with /)
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      try {
        const regex = new RegExp(pattern.slice(1, -1));
        return regex.test(command);
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Extract operation string from request
   */
  private getOperation(request: PermissionRequest): string {
    if (request.command) {
      return request.command;
    }
    if (request.path) {
      return request.path;
    }
    return '';
  }

  /**
   * Optional audit logging
   */
  private async audit(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
    if (this.config.auditLogger) {
      await this.config.auditLogger.log({
        timestamp: new Date(),
        ...entry,
      });
    }
  }
}
