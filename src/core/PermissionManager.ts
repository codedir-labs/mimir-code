/**
 * Permission system for command execution
 */

import { RiskLevel, PermissionDecision } from '../types/index.js';
import { RiskAssessor, RiskAssessment } from './RiskAssessor.js';

export class PermissionManager {
  private riskAssessor: RiskAssessor;
  private allowlist: Set<string> = new Set();
  private blocklist: Set<string> = new Set();
  private auditLog: PermissionDecision[] = [];

  constructor() {
    this.riskAssessor = new RiskAssessor();
  }

  async checkPermission(command: string): Promise<{
    allowed: boolean;
    assessment: RiskAssessment;
  }> {
    const assessment = this.riskAssessor.assess(command);

    // Check blocklist
    if (this.riskAssessor.isBlocked(command, Array.from(this.blocklist))) {
      this.logDecision(command, assessment.level, 'deny');
      return { allowed: false, assessment };
    }

    // Check allowlist
    if (this.riskAssessor.isAllowed(command, Array.from(this.allowlist))) {
      this.logDecision(command, assessment.level, 'allow');
      return { allowed: true, assessment };
    }

    // TODO: Prompt user for permission
    // For now, auto-deny high and critical
    if (assessment.level === 'high' || assessment.level === 'critical') {
      this.logDecision(command, assessment.level, 'deny');
      return { allowed: false, assessment };
    }

    this.logDecision(command, assessment.level, 'allow');
    return { allowed: true, assessment };
  }

  addToAllowlist(pattern: string): void {
    this.allowlist.add(pattern);
  }

  addToBlocklist(pattern: string): void {
    this.blocklist.add(pattern);
  }

  private logDecision(
    command: string,
    riskLevel: RiskLevel,
    decision: 'allow' | 'deny' | 'always' | 'never'
  ): void {
    this.auditLog.push({
      command,
      riskLevel,
      decision,
      timestamp: Date.now(),
    });
  }

  getAuditLog(): PermissionDecision[] {
    return [...this.auditLog];
  }
}
