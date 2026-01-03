/**
 * Risk assessment for commands with detailed explanations
 */

import type { RiskLevel, RiskAssessment } from './types.js';

export class RiskAssessor {
  // Critical patterns - system-destroying commands
  private criticalPatterns = [
    { pattern: /rm\s+-rf\s+\/(?!tmp|var\/tmp)/, reason: 'Deletes root filesystem' },
    { pattern: /format\s+[a-z]:/i, reason: 'Formats entire drive' },
    { pattern: /del\s+\/[sf]/i, reason: 'Deletes system files (Windows)' },
    { pattern: /shutdown|reboot|poweroff/, reason: 'System shutdown/reboot' },
    { pattern: /dd\s+.*of=\/dev\/(sda|hda|nvme)/, reason: 'Direct disk write (can destroy data)' },
    { pattern: /mkfs/, reason: 'Formats filesystem' },
    {
      pattern: /(>|vim|vi|nano|emacs|edit).*\/etc\/(passwd|shadow|sudoers)/,
      reason: 'Modifies critical system files',
    },
    { pattern: /curl.*\|\s*(bash|sh|python)/, reason: 'Executes remote script without inspection' },
    { pattern: /wget.*\|\s*(bash|sh|python)/, reason: 'Executes remote script without inspection' },
  ];

  // High risk patterns - destructive but recoverable
  private highPatterns = [
    { pattern: /rm\s+-rf\s+(?!\/($|\s))/, reason: 'Recursive force delete' },
    { pattern: /sudo\s+rm/, reason: 'Elevated permissions file deletion' },
    { pattern: /git\s+push\s+--force/, reason: 'Force pushes can overwrite history' },
    { pattern: /npm\s+publish/, reason: 'Publishes package to registry' },
    { pattern: /docker\s+rmi.*-f/, reason: 'Force removes Docker images' },
    { pattern: /docker\s+system\s+prune\s+-a/, reason: 'Removes all unused Docker data' },
    { pattern: /git\s+reset\s+--hard\s+HEAD~/, reason: 'Permanently deletes commits' },
    { pattern: /git\s+clean\s+-fd/, reason: 'Deletes untracked files' },
    { pattern: /chmod\s+777/, reason: 'Makes files world-writable (security risk)' },
    { pattern: /chown\s+-R/, reason: 'Recursive ownership change' },
  ];

  // Medium risk patterns - potentially problematic
  private mediumPatterns = [
    { pattern: /npm\s+install/, reason: 'Installs dependencies (can include malicious packages)' },
    { pattern: /yarn\s+add/, reason: 'Installs dependencies (can include malicious packages)' },
    { pattern: /pip\s+install/, reason: 'Installs Python packages' },
    { pattern: /git\s+push/, reason: 'Pushes changes to remote' },
    { pattern: /docker\s+run/, reason: 'Runs Docker container' },
    { pattern: /docker\s+exec/, reason: 'Executes command in container' },
    { pattern: /ssh\s+/, reason: 'Remote connection' },
    { pattern: /scp\s+/, reason: 'Remote file transfer' },
    { pattern: /rsync\s+/, reason: 'File synchronization' },
    { pattern: /npm\s+run\s+build/, reason: 'Runs build scripts' },
  ];

  /**
   * Assess risk level and provide detailed reasons
   */
  assess(command: string): RiskAssessment {
    const reasons: string[] = [];
    let maxScore = 0;

    // Check critical patterns
    for (const { pattern, reason } of this.criticalPatterns) {
      if (pattern.test(command)) {
        reasons.push(`🔴 CRITICAL: ${reason}`);
        maxScore = Math.max(maxScore, 100);
      }
    }

    // Check high patterns
    for (const { pattern, reason } of this.highPatterns) {
      if (pattern.test(command)) {
        reasons.push(`🟠 HIGH: ${reason}`);
        maxScore = Math.max(maxScore, 75);
      }
    }

    // Check medium patterns
    for (const { pattern, reason } of this.mediumPatterns) {
      if (pattern.test(command)) {
        reasons.push(`🟡 MEDIUM: ${reason}`);
        maxScore = Math.max(maxScore, 50);
      }
    }

    // Additional checks
    const additionalRisks = this.assessAdditionalRisks(command);
    reasons.push(...additionalRisks.reasons);
    maxScore = Math.max(maxScore, additionalRisks.score);

    // Determine level from score
    const level = this.scoreToLevel(maxScore);

    // If no specific risks found, it's low risk
    if (reasons.length === 0) {
      reasons.push('No specific risks detected');
    }

    return {
      level,
      reasons,
      score: maxScore,
    };
  }

  /**
   * Additional risk checks (file size, complexity, etc.)
   */
  private assessAdditionalRisks(command: string): { reasons: string[]; score: number } {
    const reasons: string[] = [];
    let score = 0;

    // Check command length (very long commands are suspicious)
    if (command.length > 500) {
      reasons.push('⚠️  Command is unusually long (possible obfuscation)');
      score = Math.max(score, 30);
    }

    // Check for multiple commands chained
    const chainCount = (command.match(/[;&|]+/g) || []).length;
    if (chainCount > 3) {
      reasons.push(`⚠️  Multiple chained commands (${chainCount} chains)`);
      score = Math.max(score, 40);
    }

    // Check for redirection to /dev/null (hiding output)
    if (/>\/dev\/null|2>&1/.test(command)) {
      reasons.push('⚠️  Output redirected (hiding results)');
      score = Math.max(score, 20);
    }

    // Check for sudo without specific command
    if (/sudo\s*$/.test(command)) {
      reasons.push('🟠 Elevated permissions without specific command');
      score = Math.max(score, 60);
    }

    // Check for environment variable manipulation
    if (/export\s+|setenv\s+/.test(command) && /PATH/.test(command)) {
      reasons.push('🟡 Modifies PATH environment variable');
      score = Math.max(score, 45);
    }

    // Check for Base64 encoding (possible obfuscation)
    if (/base64\s+--decode|echo\s+.*\|\s*base64/.test(command)) {
      reasons.push('⚠️  Uses Base64 encoding (possible obfuscation)');
      score = Math.max(score, 35);
    }

    // Check for eval (code execution)
    if (/eval\s+/.test(command)) {
      reasons.push('🟠 Uses eval (dynamic code execution)');
      score = Math.max(score, 65);
    }

    return { reasons, score };
  }

  /**
   * Convert numeric score to risk level
   */
  private scoreToLevel(score: number): RiskLevel {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
  }

  /**
   * Check if command matches any allowed patterns
   */
  isAllowed(command: string, allowlist: string[]): boolean {
    return allowlist.some((pattern) => {
      try {
        // Try as regex
        const regex = new RegExp(pattern);
        return regex.test(command);
      } catch {
        // Fallback to simple string match
        return command.includes(pattern);
      }
    });
  }

  /**
   * Check if command matches any blocked patterns
   */
  isBlocked(command: string, blocklist: string[]): boolean {
    return blocklist.some((pattern) => {
      try {
        const regex = new RegExp(pattern);
        return regex.test(command);
      } catch {
        return command.includes(pattern);
      }
    });
  }

  /**
   * Get a human-readable summary of the risk assessment
   */
  getSummary(assessment: RiskAssessment): string {
    const levelEmoji = {
      low: '🟢',
      medium: '🟡',
      high: '🟠',
      critical: '🔴',
    };

    const lines = [
      `${levelEmoji[assessment.level]} Risk Level: ${assessment.level.toUpperCase()} (score: ${assessment.score}/100)`,
      '',
      'Reasons:',
      ...assessment.reasons.map((r) => `  • ${r}`),
    ];

    return lines.join('\n');
  }
}
