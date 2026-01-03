/**
 * Security validators for injection prevention, file size limits, etc.
 */

import { logger } from './logger.js';
import { RateLimitConfig } from '@/shared/config/schemas.js';

export class SecurityValidator {
  constructor(private config: RateLimitConfig) {}

  /**
   * Validate file size doesn't exceed limit
   */
  validateFileSize(
    sizeBytes: number,
    filePath?: string
  ): {
    valid: boolean;
    reason?: string;
  } {
    const maxBytes = this.config.maxFileSizeMB * 1024 * 1024;

    if (sizeBytes > maxBytes) {
      const sizeMB = Math.round((sizeBytes / 1024 / 1024) * 100) / 100;
      const filePathSuffix = filePath ? ` for ${filePath}` : '';
      return {
        valid: false,
        reason: `File size (${sizeMB}MB) exceeds limit (${this.config.maxFileSizeMB}MB)${filePathSuffix}`,
      };
    }

    return { valid: true };
  }

  /**
   * Check for command injection patterns
   */
  detectCommandInjection(input: string): {
    detected: boolean;
    patterns: string[];
  } {
    const injectionPatterns = [
      // eslint-disable-next-line sonarjs/slow-regex
      { pattern: /;.*\$\(/, name: 'Command substitution with semicolon' },
      // eslint-disable-next-line sonarjs/slow-regex
      { pattern: /\|.*\$\(/, name: 'Command substitution with pipe' },

      { pattern: /`.*`/, name: 'Backtick command execution' },

      { pattern: /\$\{.*\}/, name: 'Variable expansion in command' },
      // eslint-disable-next-line sonarjs/slow-regex
      { pattern: /&&.*rm/, name: 'Chained destructive command' },
      // eslint-disable-next-line sonarjs/slow-regex
      { pattern: /\|\|.*rm/, name: 'Conditional destructive command' },
      // eslint-disable-next-line sonarjs/slow-regex
      { pattern: />.*\/etc/, name: 'Redirect to system files' },
      // eslint-disable-next-line sonarjs/slow-regex
      { pattern: /<.*\/dev/, name: 'Read from device files' },
      { pattern: /\$IFS/, name: 'IFS manipulation (common in injection)' },
      { pattern: /\\x[0-9a-fA-F]{2}/, name: 'Hex-encoded characters (obfuscation)' },
    ];

    const detected: string[] = [];

    for (const { pattern, name } of injectionPatterns) {
      if (pattern.test(input)) {
        detected.push(name);
      }
    }

    return {
      detected: detected.length > 0,
      patterns: detected,
    };
  }

  /**
   * Check for SQL injection patterns
   */
  detectSQLInjection(input: string): {
    detected: boolean;
    patterns: string[];
  } {
    const sqlPatterns = [
      { pattern: /'\s*OR\s*'1'\s*=\s*'1/i, name: 'Classic OR 1=1' },
      { pattern: /'\s*OR\s*1\s*=\s*1/i, name: 'OR 1=1 variant' },
      { pattern: /--/, name: 'SQL comment' },
      { pattern: /\/\*.*\*\//, name: 'Multi-line SQL comment' },
      { pattern: /;\s*DROP\s+TABLE/i, name: 'DROP TABLE statement' },
      { pattern: /;\s*DELETE\s+FROM/i, name: 'DELETE statement' },
      { pattern: /UNION\s+SELECT/i, name: 'UNION SELECT' },
      { pattern: /xp_cmdshell/i, name: 'SQL Server command execution' },
    ];

    const detected: string[] = [];

    for (const { pattern, name } of sqlPatterns) {
      if (pattern.test(input)) {
        detected.push(name);
      }
    }

    return {
      detected: detected.length > 0,
      patterns: detected,
    };
  }

  /**
   * Check for path traversal attempts
   */
  detectPathTraversal(path: string): {
    detected: boolean;
    reason?: string;
  } {
    // Check for ../ patterns
    if (/\.\.\//.test(path) || /\.\.\\/.test(path)) {
      return {
        detected: true,
        reason: 'Path traversal detected (../)',
      };
    }

    // Check for absolute paths to sensitive directories
    const sensitivePaths = [
      /^\/etc\//,
      /^\/root\//,
      /^\/proc\//,
      /^\/sys\//,
      /^C:\\Windows\\/i,
      /^C:\\Program Files\\/i,
      /^\/Library\//,
      /^\/System\//,
    ];

    for (const pattern of sensitivePaths) {
      if (pattern.test(path)) {
        return {
          detected: true,
          reason: `Access to sensitive system directory detected: ${path}`,
        };
      }
    }

    return { detected: false };
  }

  /**
   * Validate environment variable name
   */
  validateEnvVarName(name: string): {
    valid: boolean;
    reason?: string;
  } {
    // Env vars should only contain alphanumeric and underscore
    if (!/^[A-Z_][A-Z0-9_]*$/i.test(name)) {
      return {
        valid: false,
        reason: 'Invalid environment variable name (should be alphanumeric + underscore)',
      };
    }

    // Check for protected env vars
    const protectedVars = ['PATH', 'LD_LIBRARY_PATH', 'DYLD_LIBRARY_PATH', 'HOME', 'USER'];
    if (protectedVars.includes(name.toUpperCase())) {
      return {
        valid: false,
        reason: `Modifying protected environment variable: ${name}`,
      };
    }

    return { valid: true };
  }

  /**
   * Check for potentially malicious file patterns
   */
  validateFilePath(path: string): {
    valid: boolean;
    reason?: string;
  } {
    // Check for null bytes
    if (path.includes('\0')) {
      return {
        valid: false,
        reason: 'Null byte detected in path',
      };
    }

    // Check for excessively long paths
    if (path.length > 4096) {
      return {
        valid: false,
        reason: 'Path exceeds maximum length (4096 characters)',
      };
    }

    // Check path traversal
    const traversal = this.detectPathTraversal(path);
    if (traversal.detected) {
      return {
        valid: false,
        reason: traversal.reason,
      };
    }

    return { valid: true };
  }

  /**
   * Sanitize user input for safe display/logging
   */
  sanitizeForDisplay(input: string, maxLength = 200): string {
    // Truncate if too long
    let sanitized = input.length > maxLength ? input.substring(0, maxLength) + '...' : input;

    // Remove control characters except newlines and tabs
    // eslint-disable-next-line sonarjs/no-control-regex
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Replace potential injection characters with visible equivalents
    sanitized = sanitized.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&/g, '&amp;');

    return sanitized;
  }

  /**
   * Validate URL for safe fetching
   */
  validateURL(url: string): {
    valid: boolean;
    reason?: string;
  } {
    try {
      const parsed = new URL(url);

      // Only allow http/https
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return {
          valid: false,
          reason: `Unsafe protocol: ${parsed.protocol}`,
        };
      }

      // Block local/private IPs
      const hostname = parsed.hostname;
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        /^192\.168\./.test(hostname) ||
        /^10\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
      ) {
        return {
          valid: false,
          reason: 'Access to private/local network blocked',
        };
      }

      return { valid: true };
    } catch {
      return {
        valid: false,
        reason: 'Invalid URL format',
      };
    }
  }

  /**
   * Log security violation
   */
  logViolation(type: string, details: Record<string, unknown>): void {
    logger.warn(`Security violation: ${type}`, {
      ...details,
      timestamp: new Date().toISOString(),
    });
  }
}
