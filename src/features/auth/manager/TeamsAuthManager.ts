/**
 * Teams Authentication Manager
 *
 * Implements IAuthManager for Teams-integrated mode.
 * Handles:
 * - OAuth 2.0 Device Flow authentication
 * - Two-tier authentication (user + org)
 * - Multi-organization session management
 * - Automatic token refresh
 * - Secure storage in ~/.mimir/auth.json
 */

import type { IAuthManager, AuthContext } from './IAuthManager.js';
import { TeamsAPIClient } from '@/features/teams/api/TeamsAPIClient.js';
import { AuthStorage, type UserAuthData, type OrgAuthData } from '../storage/AuthStorage.js';
import { logger } from '@/shared/utils/logger.js';

/**
 * Device flow authentication options
 */
export interface DeviceFlowOptions {
  /**
   * Callback function to display user code and verification URI
   * @param userCode Short code to display (e.g., "WXYZ-5678")
   * @param verificationUri URI for user to visit
   * @param verificationUriComplete Complete URI with userCode pre-filled
   */
  onDeviceCode: (
    userCode: string,
    verificationUri: string,
    verificationUriComplete: string
  ) => void | Promise<void>;

  /**
   * Polling interval in seconds
   * @default 5
   */
  pollInterval?: number;

  /**
   * Timeout in seconds
   * @default 900 (15 minutes)
   */
  timeout?: number;

  /**
   * Optional organization to authenticate to
   * If provided, will automatically get org access token after user auth
   */
  orgSlug?: string;
}

/**
 * Teams Auth Manager
 *
 * Manages authentication with Teams backend.
 * Supports GitHub-like multi-org workflow:
 * 1. User authenticates once via device flow → userAccessToken
 * 2. User selects organization → orgAccessToken
 * 3. User can switch between organizations
 * 4. Each org has separate auth context
 */
export class TeamsAuthManager implements IAuthManager {
  private readonly apiClient: TeamsAPIClient;
  private readonly storage: AuthStorage;

  constructor(apiClient?: TeamsAPIClient, storage?: AuthStorage) {
    this.apiClient = apiClient || new TeamsAPIClient();
    this.storage = storage || new AuthStorage();
  }

  /**
   * Login via OAuth 2.0 Device Flow
   *
   * Implementation differs from IAuthManager signature to support device flow.
   * Use deviceFlowLogin() for device flow authentication.
   *
   * @deprecated Use deviceFlowLogin() instead
   * @throws Error - Not implemented, use deviceFlowLogin()
   */
  async login(_email: string, _password: string, _orgSlug?: string): Promise<void> {
    throw new Error(
      'Password-based login not supported. Use deviceFlowLogin() for device flow authentication.'
    );
  }

  /**
   * Login via OAuth 2.0 Device Flow
   *
   * Flow:
   * 1. Request device code from backend
   * 2. Display user code to user (via callback)
   * 3. Poll backend until user authorizes
   * 4. Receive userAccessToken + organizations list
   * 5. If orgSlug provided, automatically get orgAccessToken
   *
   * @param options Device flow options
   * @returns Promise that resolves when authenticated
   * @throws Error if authentication fails or times out
   */
  async deviceFlowLogin(options: DeviceFlowOptions): Promise<void> {
    logger.info('[Auth] Starting device flow authentication');

    try {
      // Step 1: Request device code
      const deviceCodeResponse = await this.apiClient.requestDeviceCode({
        clientId: 'mimir-cli',
        clientName: 'Mimir CLI',
        scope: 'user:orgs teams:read teams:write',
        orgSlug: options.orgSlug,
      });

      logger.debug('[Auth] Device code received', {
        userCode: deviceCodeResponse.userCode,
      });

      // Step 2: Display user code to user
      await options.onDeviceCode(
        deviceCodeResponse.userCode,
        deviceCodeResponse.verificationUri,
        deviceCodeResponse.verificationUriComplete
      );

      // Step 3: Poll for authorization
      const pollInterval = (options.pollInterval || deviceCodeResponse.interval) * 1000; // Convert to ms
      const timeout = (options.timeout || deviceCodeResponse.expiresIn) * 1000;
      const startTime = Date.now();

      let lastError: Error | null = null;

      while (Date.now() - startTime < timeout) {
        try {
          const tokenResponse = await this.apiClient.pollDeviceToken({
            deviceCode: deviceCodeResponse.deviceCode,
          });

          // Success! User has authorized
          logger.info('[Auth] Device flow authentication successful');

          // Store user auth data
          const userAuth: UserAuthData = {
            id: tokenResponse.user.id,
            email: tokenResponse.user.email,
            userAccessToken: tokenResponse.accessToken,
            userRefreshToken: tokenResponse.refreshToken,
            expiresAt: new Date(Date.now() + tokenResponse.expiresIn * 1000).toISOString(),
          };

          await this.storage.setUserAuth(userAuth);

          // If orgSlug provided, automatically authorize organization
          if (options.orgSlug) {
            const org = tokenResponse.organizations.find((o) => o.slug === options.orgSlug);

            if (!org) {
              throw new Error(`You are not a member of organization "${options.orgSlug}"`);
            }

            // Get org access token
            const orgAuthResponse = await this.apiClient.authorizeOrganization(
              options.orgSlug,
              tokenResponse.accessToken
            );

            if ('requiresSSO' in orgAuthResponse) {
              throw new Error(
                `Organization "${options.orgSlug}" requires SSO authentication. ` +
                  `Please visit: ${orgAuthResponse.initiateUrl}`
              );
            }

            // Store org auth data
            const orgAuth: OrgAuthData = {
              orgAccessToken: orgAuthResponse.orgAccessToken,
              orgId: orgAuthResponse.organization.id,
              orgSlug: orgAuthResponse.organization.slug,
              orgName: orgAuthResponse.organization.name,
              userId: userAuth.id,
              userEmail: userAuth.email,
              role: orgAuthResponse.organization.role as any,
              orgSecret: '', // Will be retrieved from backend config endpoint
              expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(), // 1 hour
              ssoProvider: orgAuthResponse.organization.ssoProvider || null,
              authenticatedAt: new Date().toISOString(),
            };

            await this.storage.setOrgAuth(options.orgSlug, orgAuth);
            await this.storage.setActiveOrg(options.orgSlug);

            logger.info('[Auth] Authorized organization', {
              orgSlug: options.orgSlug,
              role: orgAuth.role,
            });
          } else if (tokenResponse.organizations.length === 1) {
            // Only one org, automatically authorize it
            const org = tokenResponse.organizations[0]!;
            const orgAuthResponse = await this.apiClient.authorizeOrganization(
              org.slug,
              tokenResponse.accessToken
            );

            if (!('requiresSSO' in orgAuthResponse)) {
              const orgAuth: OrgAuthData = {
                orgAccessToken: orgAuthResponse.orgAccessToken,
                orgId: orgAuthResponse.organization.id,
                orgSlug: orgAuthResponse.organization.slug,
                orgName: orgAuthResponse.organization.name,
                userId: userAuth.id,
                userEmail: userAuth.email,
                role: orgAuthResponse.organization.role as any,
                orgSecret: '',
                expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
                ssoProvider: orgAuthResponse.organization.ssoProvider || null,
                authenticatedAt: new Date().toISOString(),
              };

              await this.storage.setOrgAuth(org.slug, orgAuth);
              await this.storage.setActiveOrg(org.slug);
            }
          }

          return; // Success!
        } catch (error) {
          lastError = error as Error;

          // Check error code
          if (lastError && 'code' in lastError) {
            const code = (lastError as any).code;

            if (code === 'authorization_pending') {
              // User hasn't authorized yet, continue polling
              await new Promise((resolve) => setTimeout(resolve, pollInterval));
              continue;
            }

            if (code === 'slow_down') {
              // Polling too fast, increase interval
              await new Promise((resolve) => setTimeout(resolve, pollInterval + 1000));
              continue;
            }

            if (code === 'expired_token') {
              throw new Error('Device code expired. Please try again.');
            }

            if (code === 'access_denied') {
              throw new Error('Authorization denied by user.');
            }
          }

          // Unknown error, rethrow
          throw lastError;
        }
      }

      // Timeout reached
      throw new Error('Authentication timeout. Please try again.');
    } catch (error) {
      logger.error('[Auth] Device flow authentication failed', { error });
      throw error;
    }
  }

  /**
   * Authorize organization (get org access token)
   *
   * Requires user to be authenticated first.
   *
   * @param orgSlug Organization slug
   * @throws Error if not authenticated or not a member
   */
  async authorizeOrg(orgSlug: string): Promise<void> {
    logger.info('[Auth] Authorizing organization', { orgSlug });

    // Check if user is authenticated
    const userAuth = await this.storage.getUserAuth();
    if (!userAuth) {
      throw new Error('Not authenticated. Please login first.');
    }

    // Get org access token
    const orgAuthResponse = await this.apiClient.authorizeOrganization(
      orgSlug,
      userAuth.userAccessToken
    );

    if ('requiresSSO' in orgAuthResponse) {
      throw new Error(
        `Organization "${orgSlug}" requires SSO authentication. ` +
          `Please visit: ${orgAuthResponse.initiateUrl}`
      );
    }

    // Store org auth data
    const orgAuth: OrgAuthData = {
      orgAccessToken: orgAuthResponse.orgAccessToken,
      orgId: orgAuthResponse.organization.id,
      orgSlug: orgAuthResponse.organization.slug,
      orgName: orgAuthResponse.organization.name,
      userId: userAuth.id,
      userEmail: userAuth.email,
      role: orgAuthResponse.organization.role as any,
      orgSecret: '',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      ssoProvider: orgAuthResponse.organization.ssoProvider || null,
      authenticatedAt: new Date().toISOString(),
    };

    await this.storage.setOrgAuth(orgSlug, orgAuth);
    await this.storage.setActiveOrg(orgSlug);

    logger.info('[Auth] Organization authorized', { orgSlug, role: orgAuth.role });
  }

  /**
   * Logout from organization(s)
   *
   * @param orgSlug Optional: specific organization to logout from (default: active org)
   * @param all If true, logout from all organizations
   */
  async logout(orgSlug?: string, all?: boolean): Promise<void> {
    logger.info('[Auth] Logging out', { orgSlug, all });

    const userAuth = await this.storage.getUserAuth();

    if (all) {
      // Logout from all organizations
      if (userAuth) {
        try {
          await this.apiClient.logout(userAuth.userRefreshToken, { all: true });
        } catch (error) {
          logger.error('[Auth] Failed to revoke tokens on backend', { error });
        }
      }

      await this.storage.clear();
      logger.info('[Auth] Logged out from all organizations');
      return;
    }

    // Logout from specific org
    const targetOrgSlug = orgSlug || (await this.storage.getActiveOrg());

    if (!targetOrgSlug) {
      throw new Error('No active organization. Please specify orgSlug.');
    }

    // Revoke org token on backend
    if (userAuth) {
      try {
        await this.apiClient.logout(userAuth.userRefreshToken, {
          orgSlug: targetOrgSlug,
        });
      } catch (error) {
        logger.error('[Auth] Failed to revoke org token on backend', { error });
      }
    }

    // Remove from storage
    await this.storage.removeOrgAuth(targetOrgSlug);

    logger.info('[Auth] Logged out from organization', { orgSlug: targetOrgSlug });
  }

  /**
   * Get authentication context for organization
   *
   * @param orgSlug Optional: specific organization (default: active org)
   * @returns Auth context if authenticated, null otherwise
   */
  async getAuth(orgSlug?: string): Promise<AuthContext | null> {
    const targetOrgSlug = orgSlug || (await this.storage.getActiveOrg());

    if (!targetOrgSlug) {
      return null;
    }

    const orgData = await this.storage.getOrgAuth(targetOrgSlug);

    if (!orgData) {
      return null;
    }

    // Check if token is expired
    const expiresAt = new Date(orgData.expiresAt);
    if (new Date() >= expiresAt) {
      // Token expired, try to refresh
      const refreshed = await this.refreshToken(targetOrgSlug);
      if (!refreshed) {
        return null;
      }

      // Get refreshed data
      const refreshedOrgData = await this.storage.getOrgAuth(targetOrgSlug);
      if (!refreshedOrgData) {
        return null;
      }

      return this.storage.orgDataToAuthContext(refreshedOrgData);
    }

    return this.storage.orgDataToAuthContext(orgData);
  }

  /**
   * Get active organization slug
   *
   * @returns Active organization slug, or null if not authenticated
   */
  async getActiveOrg(): Promise<string | null> {
    return this.storage.getActiveOrg();
  }

  /**
   * Set active organization
   *
   * @param orgSlug Organization slug to set as active
   * @throws Error if not authenticated to this organization
   */
  async setActiveOrg(orgSlug: string): Promise<void> {
    // Check if authenticated to this org
    const orgData = await this.storage.getOrgAuth(orgSlug);

    if (!orgData) {
      // Try to authorize this org
      await this.authorizeOrg(orgSlug);
    }

    await this.storage.setActiveOrg(orgSlug);
    logger.info('[Auth] Active organization set', { orgSlug });
  }

  /**
   * List all authenticated organizations
   *
   * @returns Array of organization slugs user is authenticated to
   */
  async listOrgs(): Promise<string[]> {
    return this.storage.listOrgs();
  }

  /**
   * Refresh access token for organization
   *
   * Uses user refresh token to get new user access token,
   * then re-authorizes the organization to get new org access token.
   *
   * @param orgSlug Organization slug
   * @returns true if refresh succeeded, false otherwise
   */
  async refreshToken(orgSlug: string): Promise<boolean> {
    logger.info('[Auth] Refreshing token', { orgSlug });

    try {
      // Get user refresh token
      const userAuth = await this.storage.getUserAuth();

      if (!userAuth) {
        logger.warn('[Auth] No user auth data, cannot refresh');
        return false;
      }

      // Refresh user token
      const refreshResponse = await this.apiClient.refreshUserToken(userAuth.userRefreshToken);

      // Update user auth
      userAuth.userAccessToken = refreshResponse.accessToken;
      userAuth.userRefreshToken = refreshResponse.refreshToken;
      userAuth.expiresAt = new Date(Date.now() + refreshResponse.expiresIn * 1000).toISOString();

      await this.storage.setUserAuth(userAuth);

      // Re-authorize organization
      const orgAuthResponse = await this.apiClient.authorizeOrganization(
        orgSlug,
        refreshResponse.accessToken
      );

      if ('requiresSSO' in orgAuthResponse) {
        logger.warn('[Auth] Org requires SSO, cannot auto-refresh', { orgSlug });
        return false;
      }

      // Get existing org data to preserve fields
      const existingOrgData = await this.storage.getOrgAuth(orgSlug);

      // Update org auth
      const orgAuth: OrgAuthData = {
        orgAccessToken: orgAuthResponse.orgAccessToken,
        orgId: orgAuthResponse.organization.id,
        orgSlug: orgAuthResponse.organization.slug,
        orgName: orgAuthResponse.organization.name,
        userId: userAuth.id,
        userEmail: userAuth.email,
        role: orgAuthResponse.organization.role as any,
        orgSecret: existingOrgData?.orgSecret || '',
        expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        ssoProvider: orgAuthResponse.organization.ssoProvider || null,
        authenticatedAt: new Date().toISOString(),
      };

      await this.storage.setOrgAuth(orgSlug, orgAuth);

      logger.info('[Auth] Token refreshed successfully', { orgSlug });
      return true;
    } catch (error) {
      logger.error('[Auth] Failed to refresh token', { orgSlug, error });
      return false;
    }
  }

  /**
   * Check if user is authenticated
   *
   * @param orgSlug Optional: specific organization (default: active org)
   * @returns true if authenticated, false otherwise
   */
  async isAuthenticated(orgSlug?: string): Promise<boolean> {
    const auth = await this.getAuth(orgSlug);
    return auth !== null;
  }
}
