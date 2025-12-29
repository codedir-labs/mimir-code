/**
 * Authentication storage for Teams integration
 *
 * Stores authentication data in ~/.mimir/auth.json
 * Format:
 * {
 *   "user": {
 *     "id": "...",
 *     "email": "...",
 *     "userAccessToken": "...",
 *     "userRefreshToken": "...",
 *     "expiresAt": "2025-01-01T00:00:00.000Z"
 *   },
 *   "organizations": {
 *     "acme-corp": {
 *       "orgAccessToken": "...",
 *       "orgId": "...",
 *       "orgSlug": "acme-corp",
 *       "orgName": "Acme Corp",
 *       "userId": "...",
 *       "userEmail": "user@example.com",
 *       "role": "admin",
 *       "orgSecret": "...",
 *       "expiresAt": "2025-01-01T00:00:00.000Z",
 *       "ssoProvider": null,
 *       "authenticatedAt": "2025-01-01T00:00:00.000Z"
 *     }
 *   },
 *   "activeOrg": "acme-corp"
 * }
 */

import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { AuthContext } from '../manager/IAuthManager.js';

/**
 * User-level authentication data (Tier 1)
 */
export interface UserAuthData {
  id: string;
  email: string;
  userAccessToken: string;
  userRefreshToken: string;
  expiresAt: string;
}

/**
 * Organization-level authentication data (Tier 2)
 */
export interface OrgAuthData {
  orgAccessToken: string;
  orgId: string;
  orgSlug: string;
  orgName: string;
  userId: string;
  userEmail: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  orgSecret: string;
  expiresAt: string;
  ssoProvider: string | null;
  authenticatedAt: string;
}

/**
 * Authentication file structure
 */
export interface AuthFileData {
  user: UserAuthData | null;
  organizations: Record<string, OrgAuthData>;
  activeOrg: string | null;
}

/**
 * Auth storage path
 */
const AUTH_FILE_PATH = join(homedir(), '.mimir', 'auth.json');

/**
 * Auth storage manager
 *
 * Handles reading/writing authentication data to ~/.mimir/auth.json
 * Thread-safe with file locking
 */
export class AuthStorage {
  /**
   * Ensure .mimir directory exists
   */
  private async ensureDirectory(): Promise<void> {
    const mimirDir = join(homedir(), '.mimir');
    try {
      await fs.access(mimirDir);
    } catch {
      await fs.mkdir(mimirDir, { recursive: true, mode: 0o700 }); // Owner read/write/execute only
    }
  }

  /**
   * Read auth file
   * @returns Auth data or default empty structure
   */
  async read(): Promise<AuthFileData> {
    try {
      const data = await fs.readFile(AUTH_FILE_PATH, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is corrupted, return default
      return {
        user: null,
        organizations: {},
        activeOrg: null,
      };
    }
  }

  /**
   * Write auth file
   * @param data Auth data to write
   */
  async write(data: AuthFileData): Promise<void> {
    await this.ensureDirectory();
    const json = JSON.stringify(data, null, 2);
    await fs.writeFile(AUTH_FILE_PATH, json, { mode: 0o600 }); // Owner read/write only
  }

  /**
   * Get user auth data
   */
  async getUserAuth(): Promise<UserAuthData | null> {
    const data = await this.read();
    return data.user;
  }

  /**
   * Set user auth data
   */
  async setUserAuth(user: UserAuthData | null): Promise<void> {
    const data = await this.read();
    data.user = user;
    await this.write(data);
  }

  /**
   * Get organization auth data
   */
  async getOrgAuth(orgSlug: string): Promise<OrgAuthData | null> {
    const data = await this.read();
    return data.organizations[orgSlug] || null;
  }

  /**
   * Set organization auth data
   */
  async setOrgAuth(orgSlug: string, orgData: OrgAuthData): Promise<void> {
    const data = await this.read();
    data.organizations[orgSlug] = orgData;
    await this.write(data);
  }

  /**
   * Remove organization auth data
   */
  async removeOrgAuth(orgSlug: string): Promise<void> {
    const data = await this.read();
    delete data.organizations[orgSlug];

    // If this was the active org, clear it
    if (data.activeOrg === orgSlug) {
      data.activeOrg = null;
    }

    await this.write(data);
  }

  /**
   * Get active organization
   */
  async getActiveOrg(): Promise<string | null> {
    const data = await this.read();
    return data.activeOrg;
  }

  /**
   * Set active organization
   */
  async setActiveOrg(orgSlug: string | null): Promise<void> {
    const data = await this.read();
    data.activeOrg = orgSlug;
    await this.write(data);
  }

  /**
   * List all authenticated organizations
   */
  async listOrgs(): Promise<string[]> {
    const data = await this.read();
    return Object.keys(data.organizations);
  }

  /**
   * Clear all auth data (logout from everything)
   */
  async clear(): Promise<void> {
    await this.write({
      user: null,
      organizations: {},
      activeOrg: null,
    });
  }

  /**
   * Check if user is authenticated (has user access token)
   */
  async isUserAuthenticated(): Promise<boolean> {
    const user = await this.getUserAuth();
    if (!user) return false;

    // Check if token is expired
    const expiresAt = new Date(user.expiresAt);
    return new Date() < expiresAt;
  }

  /**
   * Check if user is authenticated to a specific org
   */
  async isOrgAuthenticated(orgSlug: string): Promise<boolean> {
    const orgData = await this.getOrgAuth(orgSlug);
    if (!orgData) return false;

    // Check if token is expired
    const expiresAt = new Date(orgData.expiresAt);
    return new Date() < expiresAt;
  }

  /**
   * Convert OrgAuthData to AuthContext
   */
  orgDataToAuthContext(orgData: OrgAuthData): AuthContext {
    return {
      accessToken: orgData.orgAccessToken,
      refreshToken: '', // Refresh token is at user level
      expiresAt: new Date(orgData.expiresAt),
      orgSlug: orgData.orgSlug,
      userId: orgData.userId,
      userEmail: orgData.userEmail,
      orgSecret: orgData.orgSecret,
    };
  }

  /**
   * Get auth file path (for debugging)
   */
  getFilePath(): string {
    return AUTH_FILE_PATH;
  }
}
