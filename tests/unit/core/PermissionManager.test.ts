/**
 * Unit tests for PermissionManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionManager, RiskAssessor } from '../../../src/core/PermissionManager.js';

describe('RiskAssessor', () => {
  const assessor = new RiskAssessor();

  it('should assess critical risk for dangerous commands', () => {
    expect(assessor.assess('rm -rf /')).toBe('critical');
    expect(assessor.assess('format c:')).toBe('critical');
  });

  it('should assess high risk for destructive commands', () => {
    expect(assessor.assess('rm -rf node_modules')).toBe('high');
    expect(assessor.assess('git push --force')).toBe('high');
  });

  it('should assess medium risk for install commands', () => {
    expect(assessor.assess('npm install axios')).toBe('medium');
    expect(assessor.assess('yarn add react')).toBe('medium');
  });

  it('should assess low risk for safe commands', () => {
    expect(assessor.assess('ls -la')).toBe('low');
    expect(assessor.assess('git status')).toBe('low');
  });
});

describe('PermissionManager', () => {
  let manager: PermissionManager;

  beforeEach(() => {
    manager = new PermissionManager();
  });

  it('should allow low risk commands by default', async () => {
    const allowed = await manager.checkPermission('ls -la');
    expect(allowed).toBe(true);
  });

  it('should deny high risk commands by default', async () => {
    const allowed = await manager.checkPermission('rm -rf /');
    expect(allowed).toBe(false);
  });

  it('should respect allowlist', async () => {
    manager.addToAllowlist('rm -rf node_modules');
    const allowed = await manager.checkPermission('rm -rf node_modules');
    expect(allowed).toBe(true);
  });

  it('should respect blocklist', async () => {
    manager.addToBlocklist('git push');
    const allowed = await manager.checkPermission('git push');
    expect(allowed).toBe(false);
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
