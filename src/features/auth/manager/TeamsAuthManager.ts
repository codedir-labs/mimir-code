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
import {
  TeamsAPIClient,
  type DeviceCodeResponse,
  type DeviceTokenResponse,
  type OrgAuthorizeResponse,
} from '@/features/teams/api/TeamsAPIClient.js';
import { AuthStorage, type UserAuthData, type OrgAuthData } from '../storage/AuthStorage.js';
import { logger } from '@/shared/utils/logger.js';

/**
 * Valid organization role types
 */
type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

/**
 * Type guard for errors with a 'code' property (RFC 8628 error codes)
 */
function isErrorWithCode(error: unknown): error is Error & { code: string } {
  return (
    error instanceof Error &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
  );
}

/**
 * Safely cast a role string to OrgRole type
 */
function toOrgRole(role: string): OrgRole {
  const validRoles: OrgRole[] = ['owner', 'admin', 'member', 'viewer'];
  if (validRoles.includes(role as OrgRole)) {
    return role as OrgRole;
  }
  return 'member'; // Default to member if unknown role
}

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
      const deviceCodeResponse = await this.requestDeviceCode(options);
      await this.displayDeviceCode(options, deviceCodeResponse);
      await this.pollForToken(options, deviceCodeResponse);
    } catch (error) {
      logger.error('[Auth] Device flow authentication failed', { error });
      throw error;
    }
  }

  /**
   * Request device code from backend
   */
  private async requestDeviceCode(options: DeviceFlowOptions): Promise<DeviceCodeResponse> {
    const deviceCodeResponse = await this.apiClient.requestDeviceCode({
      clientId: 'mimir-cli',
      clientName: 'Mimir CLI',
      scope: 'user:orgs teams:read teams:write',
      orgSlug: options.orgSlug,
    });

    logger.debug('[Auth] Device code received', {
      userCode: deviceCodeResponse.userCode,
    });

    return deviceCodeResponse;
  }

  /**
   * Display user code to user via callback
   */
  private async displayDeviceCode(
    options: DeviceFlowOptions,
    deviceCodeResponse: DeviceCodeResponse
  ): Promise<void> {
    await options.onDeviceCode(
      deviceCodeResponse.userCode,
      deviceCodeResponse.verificationUri,
      deviceCodeResponse.verificationUriComplete
    );
  }

  /**
   * Poll for token until user authorizes or timeout
   */
  private async pollForToken(
    options: DeviceFlowOptions,
    deviceCodeResponse: DeviceCodeResponse
  ): Promise<void> {
    const pollInterval = (options.pollInterval || deviceCodeResponse.interval) * 1000;
    const timeout = (options.timeout || deviceCodeResponse.expiresIn) * 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = await this.attemptTokenPoll(options, deviceCodeResponse, pollInterval);
      if (result === 'success') {
        return;
      }
      // result === 'continue' means keep polling
    }

    throw new Error('Authentication timeout. Please try again.');
  }

  /**
   * Single attempt to poll for token
   * @returns 'success' if authenticated, 'continue' if should keep polling
   */
  private async attemptTokenPoll(
    options: DeviceFlowOptions,
    deviceCodeResponse: DeviceCodeResponse,
    pollInterval: number
  ): Promise<'success' | 'continue'> {
    try {
      const tokenResponse = await this.apiClient.pollDeviceToken({
        deviceCode: deviceCodeResponse.deviceCode,
      });

      await this.processAuthResponse(tokenResponse, options);
      return 'success';
    } catch (error) {
      return this.handlePollingError(error, pollInterval);
    }
  }

  /**
   * Handle polling errors (RFC 8628 error codes)
   * @returns 'continue' if should keep polling
   * @throws Error for fatal errors
   */
  private async handlePollingError(error: unknown, pollInterval: number): Promise<'continue'> {
    if (!isErrorWithCode(error)) {
      throw error;
    }

    const { code } = error;

    if (code === 'authorization_pending') {
      await this.sleep(pollInterval);
      return 'continue';
    }

    if (code === 'slow_down') {
      await this.sleep(pollInterval + 1000);
      return 'continue';
    }

    if (code === 'expired_token') {
      throw new Error('Device code expired. Please try again.');
    }

    if (code === 'access_denied') {
      throw new Error('Authorization denied by user.');
    }

    throw error;
  }

  /**
   * Process successful auth response
   */
  private async processAuthResponse(
    tokenResponse: DeviceTokenResponse,
    options: DeviceFlowOptions
  ): Promise<void> {
    logger.info('[Auth] Device flow authentication successful');

    const userAuth = this.createUserAuthData(tokenResponse);
    await this.storage.setUserAuth(userAuth);

    if (options.orgSlug) {
      await this.authorizeSpecificOrg(options.orgSlug, tokenResponse, userAuth);
      return;
    }

    if (tokenResponse.organizations.length === 1) {
      await this.authorizeSingleOrg(tokenResponse, userAuth);
    }
  }

  /**
   * Create user auth data from token response
   */
  private createUserAuthData(tokenResponse: DeviceTokenResponse): UserAuthData {
    return {
      id: tokenResponse.user.id,
      email: tokenResponse.user.email,
      userAccessToken: tokenResponse.accessToken,
      userRefreshToken: tokenResponse.refreshToken,
      expiresAt: new Date(Date.now() + tokenResponse.expiresIn * 1000).toISOString(),
    };
  }

  /**
   * Authorize a specific organization
   */
  private async authorizeSpecificOrg(
    orgSlug: string,
    tokenResponse: DeviceTokenResponse,
    userAuth: UserAuthData
  ): Promise<void> {
    const org = tokenResponse.organizations.find((o) => o.slug === orgSlug);
    if (!org) {
      throw new Error(`You are not a member of organization "${orgSlug}"`);
    }

    const orgAuthResponse = await this.apiClient.authorizeOrganization(
      orgSlug,
      tokenResponse.accessToken
    );

    if ('requiresSSO' in orgAuthResponse) {
      throw new Error(
        `Organization "${orgSlug}" requires SSO authentication. ` +
          `Please visit: ${orgAuthResponse.initiateUrl}`
      );
    }

    await this.storeOrgAuth(orgSlug, orgAuthResponse, userAuth);
    logger.info('[Auth] Authorized organization', { orgSlug });
  }

  /**
   * Authorize when there's only one organization
   */
  private async authorizeSingleOrg(
    tokenResponse: DeviceTokenResponse,
    userAuth: UserAuthData
  ): Promise<void> {
    const org = tokenResponse.organizations[0];
    if (!org) {
      return;
    }

    const orgAuthResponse = await this.apiClient.authorizeOrganization(
      org.slug,
      tokenResponse.accessToken
    );

    if ('requiresSSO' in orgAuthResponse) {
      return;
    }

    await this.storeOrgAuth(org.slug, orgAuthResponse, userAuth);
  }

  /**
   * Store organization auth data
   */
  private async storeOrgAuth(
    orgSlug: string,
    orgAuthResponse: OrgAuthorizeResponse,
    userAuth: UserAuthData,
    existingOrgSecret?: string
  ): Promise<void> {
    const orgAuth: OrgAuthData = {
      orgAccessToken: orgAuthResponse.orgAccessToken,
      orgId: orgAuthResponse.organization.id,
      orgSlug: orgAuthResponse.organization.slug,
      orgName: orgAuthResponse.organization.name,
      userId: userAuth.id,
      userEmail: userAuth.email,
      role: toOrgRole(orgAuthResponse.organization.role),
      orgSecret: existingOrgSecret ?? '',
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      ssoProvider: orgAuthResponse.organization.ssoProvider || null,
      authenticatedAt: new Date().toISOString(),
    };

    await this.storage.setOrgAuth(orgSlug, orgAuth);
    await this.storage.setActiveOrg(orgSlug);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

    await this.storeOrgAuth(orgSlug, orgAuthResponse, userAuth);
    logger.info('[Auth] Organization authorized', { orgSlug });
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

      // Get existing org data to preserve orgSecret
      const existingOrgData = await this.storage.getOrgAuth(orgSlug);

      // Update org auth (preserving existing org secret)
      await this.storeOrgAuth(orgSlug, orgAuthResponse, userAuth, existingOrgData?.orgSecret);

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
