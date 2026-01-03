/**
 * Teams API Client Implementation
 *
 * HTTP client for communicating with Mimir Teams backend.
 * Handles authentication, token refresh, and API requests.
 */

import axios, { type AxiosInstance } from 'axios';
import type { ITeamsAPIClient, ProviderRegistryResponse } from './ITeamsAPIClient.js';
import type { ConfigResponse } from '@codedir/mimir-teams-contracts';

/**
 * Device authorization request
 */
export interface DeviceCodeRequest {
  clientId: string;
  clientName?: string;
  scope?: string;
  orgSlug?: string;
}

/**
 * Device code response (RFC 8628)
 */
export interface DeviceCodeResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  expiresIn: number;
  interval: number;
}

/**
 * Device token request
 */
export interface DeviceTokenRequest {
  deviceCode: string;
}

/**
 * Device token response
 */
export interface DeviceTokenResponse {
  tokenType: 'Bearer';
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
  user: {
    id: string;
    email: string;
    authMethod: string;
  };
  organizations: Array<{
    id: string;
    slug: string;
    name: string;
    role: 'owner' | 'admin' | 'member' | 'viewer';
    requiresSSO: boolean;
  }>;
}

/**
 * Organization authorization request
 */
export interface OrgAuthorizeRequest {
  userAccessToken: string;
}

/**
 * Organization authorization response
 */
export interface OrgAuthorizeResponse {
  orgAccessToken: string;
  organization: {
    id: string;
    slug: string;
    name: string;
    role: string;
    ssoProvider?: string | null;
    ssoAuthenticatedAt?: string;
  };
}

/**
 * SSO required response
 */
export interface SSORequiredResponse {
  requiresSSO: true;
  ssoProvider: {
    id: string;
    type: string;
    displayName: string;
  };
  initiateUrl: string;
}

/**
 * Teams API client configuration
 */
export interface TeamsAPIClientConfig {
  /**
   * Base URL for Teams backend API
   * @default process.env.TEAMS_API_URL || 'http://localhost:3000/api/v1'
   */
  baseUrl?: string;

  /**
   * Access token provider (optional)
   * Called before each request to get current access token
   */
  getAccessToken?: () => Promise<string | null>;

  /**
   * Organization slug provider (optional)
   * Called before each org-scoped request to get current org
   */
  getOrgSlug?: () => Promise<string | null>;

  /**
   * Token refresh handler (optional)
   * Called when access token expires
   */
  onTokenExpired?: () => Promise<void>;

  /**
   * Request timeout in milliseconds
   * @default 30000 (30 seconds)
   */
  timeout?: number;
}

/**
 * Teams API Client
 *
 * Implements HTTP communication with Mimir Teams backend.
 * Supports:
 * - OAuth 2.0 Device Flow (RFC 8628)
 * - Two-tier authentication (user + org)
 * - Automatic token refresh
 * - Organization-scoped API calls
 */
export class TeamsAPIClient implements ITeamsAPIClient {
  private readonly httpClient: AxiosInstance;
  private readonly getAccessToken?: () => Promise<string | null>;
  private readonly onTokenExpired?: () => Promise<void>;

  constructor(config: TeamsAPIClientConfig = {}) {
    const baseUrl = config.baseUrl || process.env.TEAMS_API_URL || 'http://localhost:3000/api/v1';

    this.getAccessToken = config.getAccessToken;
    // Note: config.getOrgSlug is accepted but not yet used - will be used for org-scoped requests
    this.onTokenExpired = config.onTokenExpired;

    this.httpClient = axios.create({
      baseURL: baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mimir-CLI/0.1.0',
      },
    });

    // Add request interceptor to inject auth token
    this.httpClient.interceptors.request.use(
      async (config) => {
        // Only inject token if getAccessToken is provided
        if (this.getAccessToken) {
          const token = await this.getAccessToken();
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        }
        return config;
      },
      (error: unknown) => Promise.reject(error)
    );

    // Add response interceptor to handle token expiration
    this.httpClient.interceptors.response.use(
      (response) => response,
      async (error: unknown) => {
        // Handle 401 Unauthorized (token expired)
        if (
          error &&
          typeof error === 'object' &&
          'response' in error &&
          error.response &&
          typeof error.response === 'object' &&
          'status' in error.response &&
          error.response.status === 401 &&
          this.onTokenExpired
        ) {
          await this.onTokenExpired();
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Device Flow: Request device code
   *
   * POST /auth/device/code
   *
   * @param request Device code request
   * @returns Device code response with userCode and verificationUri
   */
  async requestDeviceCode(request: DeviceCodeRequest): Promise<DeviceCodeResponse> {
    const response = await this.httpClient.post<DeviceCodeResponse>('/auth/device/code', request);
    return response.data;
  }

  /**
   * Device Flow: Poll for token
   *
   * POST /auth/device/token
   *
   * Poll this endpoint until user authorizes.
   * Handles authorization_pending, slow_down, and other RFC 8628 error codes.
   *
   * @param request Device token request
   * @returns Token response with user info and organizations
   * @throws Error with code: authorization_pending | slow_down | expired_token | access_denied
   */
  async pollDeviceToken(request: DeviceTokenRequest): Promise<DeviceTokenResponse> {
    try {
      const response = await this.httpClient.post<DeviceTokenResponse>(
        '/auth/device/token',
        request
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        // Re-throw with error code from RFC 8628
        const apiError = new Error(
          error.response.data.error_description || error.response.data.error
        ) as Error & { code?: string };
        apiError.code = error.response.data.error;
        throw apiError;
      }
      throw error;
    }
  }

  /**
   * Organization Authorization: Get org access token
   *
   * POST /auth/orgs/:slug/authorize
   *
   * Two-tier authentication:
   * 1. User authenticates (device flow) → userAccessToken
   * 2. User authorizes org (this method) → orgAccessToken
   *
   * @param orgSlug Organization slug
   * @param userAccessToken User access token from device flow
   * @returns Org access token or SSO required response
   * @throws Error if not a member or SSO required
   */
  async authorizeOrganization(
    orgSlug: string,
    userAccessToken: string
  ): Promise<OrgAuthorizeResponse | SSORequiredResponse> {
    try {
      const response = await this.httpClient.post<OrgAuthorizeResponse>(
        `/auth/orgs/${orgSlug}/authorize`,
        {},
        {
          headers: {
            Authorization: `Bearer ${userAccessToken}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 403) {
        // Check if SSO is required
        const data = error.response.data;
        if (data.requiresSSO) {
          return data as SSORequiredResponse;
        }
      }
      throw error;
    }
  }

  /**
   * Get user info
   *
   * GET /auth/me
   *
   * Requires userAccessToken (Tier 1)
   *
   * @param userAccessToken User access token
   * @returns User info with organizations list
   */
  async getUserInfo(userAccessToken: string): Promise<{
    user: {
      id: string;
      email: string;
      emailConfirmed: boolean;
      createdAt: string;
    };
    organizations: Array<{
      id: string;
      slug: string;
      name: string;
      role: string;
      requiresSSO: boolean;
    }>;
  }> {
    const response = await this.httpClient.get('/auth/me', {
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
      },
    });
    return response.data;
  }

  /**
   * Refresh user access token
   *
   * POST /auth/refresh
   *
   * @param refreshToken User refresh token
   * @returns New access token and refresh token
   */
  async refreshUserToken(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }> {
    const response = await this.httpClient.post('/auth/refresh', {
      refreshToken,
    });
    return response.data;
  }

  /**
   * Logout from organization(s)
   *
   * POST /auth/logout
   *
   * @param refreshToken Refresh token to revoke
   * @param options Logout options
   */
  async logout(
    refreshToken: string,
    options?: {
      orgSlug?: string;
      all?: boolean;
    }
  ): Promise<{ success: boolean }> {
    const response = await this.httpClient.post('/auth/logout', {
      refreshToken,
      ...options,
    });
    return response.data;
  }

  /**
   * Get configuration for organization/team
   *
   * GET /orgs/:orgSlug/config
   * GET /orgs/:orgSlug/teams/:teamId/config
   *
   * Requires orgAccessToken (Tier 2)
   *
   * @param orgSlug Organization slug
   * @param teamId Optional team ID for team-specific config
   * @returns Configuration response
   */
  async getConfig(orgSlug: string, teamId?: string): Promise<ConfigResponse> {
    const url = teamId ? `/orgs/${orgSlug}/teams/${teamId}/config` : `/orgs/${orgSlug}/config`;

    const response = await this.httpClient.get<ConfigResponse>(url);
    return response.data;
  }

  /**
   * Get provider registry (TODO: implement in backend)
   *
   * GET /orgs/:orgSlug/registry/providers
   * GET /orgs/:orgSlug/teams/:teamId/registry/providers
   *
   * Requires orgAccessToken (Tier 2)
   *
   * @param orgSlug Organization slug
   * @param teamId Optional team ID for team-specific registry
   * @returns Provider registry response
   */
  async getProviders(orgSlug: string, teamId?: string): Promise<ProviderRegistryResponse> {
    const url = teamId
      ? `/orgs/${orgSlug}/teams/${teamId}/registry/providers`
      : `/orgs/${orgSlug}/registry/providers`;

    const response = await this.httpClient.get<ProviderRegistryResponse>(url);
    return response.data;
  }

  /**
   * List teams in organization
   *
   * GET /orgs/:orgSlug/teams
   *
   * Requires orgAccessToken (Tier 2)
   *
   * @param orgSlug Organization slug
   * @returns Teams list
   */
  async listTeams(orgSlug: string): Promise<{
    teams: Array<{
      id: string;
      slug: string;
      name: string;
      description?: string;
      repository?: string;
      budgetMonthlyUsd?: number;
      memberCount: number;
      userRole: string | null;
    }>;
    meta: {
      total: number;
      orgId: string;
      orgSlug: string;
    };
  }> {
    const response = await this.httpClient.get(`/orgs/${orgSlug}/teams`);
    return response.data;
  }

  /**
   * Create team in organization
   *
   * POST /orgs/:orgSlug/teams
   *
   * Requires orgAccessToken (Tier 2) with admin role
   *
   * @param orgSlug Organization slug
   * @param team Team data
   * @returns Created team
   */
  async createTeam(
    orgSlug: string,
    team: {
      slug: string;
      name: string;
      description?: string;
      repository?: string;
      budgetMonthlyUsd?: number;
    }
  ): Promise<{
    team: {
      id: string;
      slug: string;
      name: string;
      description?: string;
      repository?: string;
      budgetMonthlyUsd?: number;
      memberCount: number;
      userRole: string;
    };
    message: string;
  }> {
    const response = await this.httpClient.post(`/orgs/${orgSlug}/teams`, team);
    return response.data;
  }

  /**
   * ITeamsAPIClient implementation
   */
  public config = {
    get: async (orgSlug: string, teamId?: string): Promise<ConfigResponse> => {
      return this.getConfig(orgSlug, teamId);
    },
  };

  public registry = {
    getProviders: async (orgSlug: string, teamId?: string): Promise<ProviderRegistryResponse> => {
      return this.getProviders(orgSlug, teamId);
    },
  };
}
