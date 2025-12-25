/**
 * Unit tests for PermissionManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionManager } from '../../../src/core/PermissionManager.js';
import { RiskAssessor } from '../../../src/core/RiskAssessor.js';

describe('RiskAssessor', () => {
  const assessor = new RiskAssessor();

  it('should assess critical risk for dangerous commands', () => {
    expect(assessor.assess('rm -rf /').level).toBe('critical');
    expect(assessor.assess('format c:').level).toBe('critical');
  });

  it('should assess high risk for destructive commands', () => {
    expect(assessor.assess('rm -rf node_modules').level).toBe('high');
    expect(assessor.assess('git push --force').level).toBe('high');
  });

  it('should assess medium risk for install commands', () => {
    expect(assessor.assess('npm install axios').level).toBe('medium');
    expect(assessor.assess('yarn add react').level).toBe('medium');
  });

  it('should assess low risk for safe commands', () => {
    expect(assessor.assess('ls -la').level).toBe('low');
    expect(assessor.assess('git status').level).toBe('low');
  });
});

describe('PermissionManager', () => {
  let manager: PermissionManager;

  beforeEach(() => {
    manager = new PermissionManager();
  });

  it('should allow low risk commands by default', async () => {
    const result = await manager.checkPermission('ls -la');
    expect(result.allowed).toBe(true);
  });

  it('should deny high risk commands by default', async () => {
    const result = await manager.checkPermission('rm -rf /');
    expect(result.allowed).toBe(false);
  });

  it('should respect allowlist', async () => {
    manager.addToAllowlist('rm -rf node_modules');
    const result = await manager.checkPermission('rm -rf node_modules');
    expect(result.allowed).toBe(true);
  });

  it('should respect blocklist', async () => {
    manager.addToBlocklist('git push');
    const result = await manager.checkPermission('git push');
    expect(result.allowed).toBe(false);
  });

  it('should maintain audit log', async () => {
    await manager.checkPermission('ls -la');
    await manager.checkPermission('rm -rf /');

    const log = manager.getAuditLog();
    expect(log).toHaveLength(2);
    expect(log[0]?.command).toBe('ls -la');
    expect(log[1]?.command).toBe('rm -rf /');
  });
});
