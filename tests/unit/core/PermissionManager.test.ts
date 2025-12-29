/**
 * Unit tests for PermissionManager
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionManager } from '@codedir/mimir-agents';
import type {
  PermissionManagerConfig,
  PermissionRequest,
  IAuditLogger,
  AuditLogEntry,
} from '@codedir/mimir-agents';

describe('PermissionManager', () => {
  let manager: PermissionManager;
  let auditLog: AuditLogEntry[];
  let mockAuditLogger: IAuditLogger;

  beforeEach(() => {
    auditLog = [];
    mockAuditLogger = {
      log: vi.fn(async (entry: AuditLogEntry) => {
        auditLog.push(entry);
      }),
    };

    const config: PermissionManagerConfig = {
      allowlist: [],
      blocklist: [],
      acceptRiskLevel: 'low',
      autoAccept: true,
      auditLogger: mockAuditLogger,
    };
    manager = new PermissionManager(config);
  });

  it('should allow low risk commands by default', async () => {
    const request: PermissionRequest = { type: 'bash', command: 'ls -la' };
    const result = await manager.checkPermission(request);
    expect(result.allowed).toBe(true);
  });

  it('should deny high risk commands by default', async () => {
    const request: PermissionRequest = { type: 'bash', command: 'rm -rf /' };
    const result = await manager.checkPermission(request);
    expect(result.allowed).toBe(false);
  });

  it('should respect allowlist', async () => {
    const config: PermissionManagerConfig = {
      allowlist: ['rm -rf node_modules'],
      blocklist: [],
      acceptRiskLevel: 'low',
      autoAccept: true,
      auditLogger: mockAuditLogger,
    };
    const managerWithAllowlist = new PermissionManager(config);

    const request: PermissionRequest = { type: 'bash', command: 'rm -rf node_modules' };
    const result = await managerWithAllowlist.checkPermission(request);
    expect(result.allowed).toBe(true);
  });

  it('should respect blocklist', async () => {
    const config: PermissionManagerConfig = {
      allowlist: [],
      blocklist: ['git push'],
      acceptRiskLevel: 'high', // Allow high risk, but blocklist takes priority
      autoAccept: true,
      auditLogger: mockAuditLogger,
    };
    const managerWithBlocklist = new PermissionManager(config);

    const request: PermissionRequest = { type: 'bash', command: 'git push' };
    const result = await managerWithBlocklist.checkPermission(request);
    expect(result.allowed).toBe(false);
  });

  it('should maintain audit log', async () => {
    const request1: PermissionRequest = { type: 'bash', command: 'ls -la' };
    const request2: PermissionRequest = { type: 'bash', command: 'rm -rf /' };

    await manager.checkPermission(request1);
    await manager.checkPermission(request2);

    expect(auditLog).toHaveLength(2);
    expect(auditLog[0]?.operation).toBe('ls -la');
    expect(auditLog[1]?.operation).toBe('rm -rf /');
  });

  describe('risk level acceptance', () => {
    it('should auto-accept commands at or below accept risk level', async () => {
      const config: PermissionManagerConfig = {
        allowlist: [],
        blocklist: [],
        acceptRiskLevel: 'medium',
        autoAccept: true,
      };
      const managerMedium = new PermissionManager(config);

      // Low risk - should be accepted
      const lowRisk: PermissionRequest = { type: 'bash', command: 'ls -la' };
      const lowResult = await managerMedium.checkPermission(lowRisk);
      expect(lowResult.allowed).toBe(true);

      // Medium risk (npm install) - should be accepted
      const mediumRisk: PermissionRequest = { type: 'bash', command: 'npm install express' };
      const mediumResult = await managerMedium.checkPermission(mediumRisk);
      expect(mediumResult.allowed).toBe(true);
    });

    it('should deny commands above accept risk level', async () => {
      const config: PermissionManagerConfig = {
        allowlist: [],
        blocklist: [],
        acceptRiskLevel: 'low',
        autoAccept: true,
      };
      const managerLow = new PermissionManager(config);

      // High risk - should be denied
      const highRisk: PermissionRequest = { type: 'bash', command: 'rm -rf ./node_modules' };
      const highResult = await managerLow.checkPermission(highRisk);
      expect(highResult.allowed).toBe(false);
    });

    it('should deny all when autoAccept is false', async () => {
      const config: PermissionManagerConfig = {
        allowlist: [],
        blocklist: [],
        acceptRiskLevel: 'critical', // Even with high accept level
        autoAccept: false, // Auto-accept disabled
      };
      const managerNoAuto = new PermissionManager(config);

      const lowRisk: PermissionRequest = { type: 'bash', command: 'ls -la' };
      const result = await managerNoAuto.checkPermission(lowRisk);
      expect(result.allowed).toBe(false);
    });
  });

  describe('file operations', () => {
    it('should handle file read requests', async () => {
      const request: PermissionRequest = { type: 'file_read', path: '/etc/passwd' };
      const result = await manager.checkPermission(request);
      // Low risk file read with low accept level should be allowed
      expect(result.riskLevel).toBeDefined();
    });

    it('should handle file write requests', async () => {
      const request: PermissionRequest = { type: 'file_write', path: './output.txt' };
      const result = await manager.checkPermission(request);
      expect(result.riskLevel).toBeDefined();
    });
  });
});
