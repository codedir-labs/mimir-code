/**
 * TODO-MOCK: Remove this file when real Teams backend is implemented
 *
 * Mock Teams API Client for development.
 * Simulates backend responses without making actual HTTP requests.
 *
 * See MOCKING.md for details on how to replace this with real TeamsAPIClient.
 */

import type {
  LoginRequest,
  LoginResponse,
  RefreshRequest,
  RefreshResponse,
  LogoutRequest,
  LogoutResponse,
  ListOrganizationsResponse,
  GetOrganizationResponse,
  GetConfigResponse,
  ListTeamsResponse,
  DetectTeamRequest,
  DetectTeamResponse,
} from '@codedir/mimir-teams-contracts';

/**
 * Mock Teams API Client
 *
 * **THIS IS A MOCK** - Does not make real HTTP requests.
 * All data is hardcoded for development purposes.
 *
 * Replace with real TeamsAPIClient when backend is ready.
 */
export class MockTeamsAPIClient {
  private baseURL: string;
  private accessToken?: string;

  constructor(config: { baseURL: string; accessToken?: string }) {
    this.baseURL = config.baseURL;
    this.accessToken = config.accessToken;

    console.warn('⚠️  Using MockTeamsAPIClient - Backend responses are simulated');
  }

  /**
   * Mock auth endpoint
   */
  public readonly auth = {
    login: async (request: LoginRequest): Promise<LoginResponse> => {
      // TODO-MOCK: Replace with real API call
      // Mock validation: Accept any email with password >= 8 chars
      if (!request.email.includes('@')) {
        throw new Error('Invalid email format');
      }
      if (request.password.length < 8) {
        throw new Error('Password must be at least 8 characters');
      }

      // Mock delay to simulate network
      await this.mockDelay(500);

      // Return mock response
      return {
        accessToken: `mock-access-token-${Date.now()}`,
        refreshToken: `mock-refresh-token-${Date.now()}`,
        expiresIn: 900, // 15 minutes
        user: {
          id: 'mock-user-001',
          email: request.email,
          fullName: 'Mock User',
          createdAt: new Date().toISOString(),
          organizations: [
            {
              orgId: 'mock-org-001',
              orgSlug: 'acme-corp',
              orgName: 'Acme Corporation (MOCK)',
              role: 'member',
              email: request.email,
            },
            {
              orgId: 'mock-org-002',
              orgSlug: 'startup-xyz',
              orgName: 'Startup XYZ (MOCK)',
              role: 'owner',
              email: request.email,
            },
          ],
        },
        orgSecret: 'mock-org-secret-for-hmac',
      };
    },

    refresh: async (_request: RefreshRequest): Promise<RefreshResponse> => {
      // TODO-MOCK: Replace with real API call
      await this.mockDelay(200);

      return {
        accessToken: `mock-access-token-refreshed-${Date.now()}`,
        refreshToken: `mock-refresh-token-refreshed-${Date.now()}`,
        expiresIn: 900,
      };
    },

    logout: async (_request: LogoutRequest): Promise<LogoutResponse> => {
      // TODO-MOCK: Replace with real API call
      await this.mockDelay(200);

      return {
        success: true,
      };
    },
  };

  /**
   * Mock organizations endpoint
   */
  public readonly organizations = {
    list: async (): Promise<ListOrganizationsResponse> => {
      // TODO-MOCK: Replace with real API call
      await this.mockDelay(300);

      return {
        organizations: [
          {
            id: 'mock-org-001',
            slug: 'acme-corp',
            name: 'Acme Corporation (MOCK)',
            subscriptionTier: 'teams',
            role: 'member',
            userEmail: 'user@example.com',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'mock-org-002',
            slug: 'startup-xyz',
            name: 'Startup XYZ (MOCK)',
            subscriptionTier: 'enterprise',
            role: 'owner',
            userEmail: 'user@example.com',
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: new Date().toISOString(),
          },
        ],
      };
    },

    get: async (slug: string): Promise<GetOrganizationResponse> => {
      // TODO-MOCK: Replace with real API call
      await this.mockDelay(300);

      const mockOrgs: Record<string, any> = {
        'acme-corp': {
          id: 'mock-org-001',
          slug: 'acme-corp',
          name: 'Acme Corporation (MOCK)',
          subscriptionTier: 'teams',
          budget: {
            monthlyLimit: 5000,
            currentUsage: 1234.56,
            remaining: 3765.44,
          },
          memberCount: 25,
          teamCount: 5,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: new Date().toISOString(),
        },
        'startup-xyz': {
          id: 'mock-org-002',
          slug: 'startup-xyz',
          name: 'Startup XYZ (MOCK)',
          subscriptionTier: 'enterprise',
          budget: {
            monthlyLimit: 10000,
            currentUsage: 2500.0,
            remaining: 7500.0,
          },
          memberCount: 10,
          teamCount: 3,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: new Date().toISOString(),
        },
      };

      const org = mockOrgs[slug];
      if (!org) {
        throw new Error(`Organization not found: ${slug}`);
      }

      return { organization: org };
    },
  };

  /**
   * Mock teams endpoint
   */
  public readonly teams = {
    list: async (_orgSlug: string): Promise<ListTeamsResponse> => {
      // TODO-MOCK: Replace with real API call
      await this.mockDelay(300);

      return {
        teams: [
          {
            id: 'mock-team-001',
            orgId: 'mock-org-001',
            slug: 'frontend-team',
            name: 'Frontend Team (MOCK)',
            description: 'Frontend development team',
            repository: 'git@github.com:acme/frontend.git',
            role: 'developer',
            memberCount: 8,
            budget: {
              monthlyLimit: 2000,
              currentUsage: 567.89,
              remaining: 1432.11,
            },
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'mock-team-002',
            orgId: 'mock-org-001',
            slug: 'backend-team',
            name: 'Backend Team (MOCK)',
            description: 'Backend development team',
            repository: 'git@github.com:acme/backend.git',
            role: 'admin',
            memberCount: 12,
            budget: {
              monthlyLimit: 3000,
              currentUsage: 1234.56,
              remaining: 1765.44,
            },
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: new Date().toISOString(),
          },
        ],
      };
    },

    detect: async (request: DetectTeamRequest): Promise<DetectTeamResponse> => {
      // TODO-MOCK: Replace with real API call
      await this.mockDelay(300);

      // Mock team detection based on repository
      const mockTeamMappings: Record<string, any[]> = {
        'git@github.com:acme/frontend.git': [
          {
            teamId: 'mock-team-001',
            teamSlug: 'frontend-team',
            teamName: 'Frontend Team (MOCK)',
            role: 'developer',
          },
        ],
        'git@github.com:acme/backend.git': [
          {
            teamId: 'mock-team-002',
            teamSlug: 'backend-team',
            teamName: 'Backend Team (MOCK)',
            role: 'admin',
          },
        ],
        'git@github.com:acme/monorepo.git': [
          // Multiple teams can share a repo
          {
            teamId: 'mock-team-001',
            teamSlug: 'frontend-team',
            teamName: 'Frontend Team (MOCK)',
            role: 'developer',
          },
          {
            teamId: 'mock-team-002',
            teamSlug: 'backend-team',
            teamName: 'Backend Team (MOCK)',
            role: 'admin',
          },
        ],
      };

      const teams = mockTeamMappings[request.repository] || [];
      return { teams };
    },
  };

  /**
   * Mock config endpoint
   */
  public readonly config = {
    get: async (_orgSlug: string, _teamId?: string): Promise<GetConfigResponse> => {
      // TODO-MOCK: Replace with real API call
      await this.mockDelay(300);

      return {
        organization: {
          apiUrl: this.baseURL,
          slug: 'acme-corp',
          name: 'Acme Corporation (MOCK)',
          enforcement: {
            allowedModels: ['claude-sonnet-4.5', 'deepseek-chat'],
            blockedModels: [],
            allowedProviders: ['anthropic', 'deepseek'],
            globalAllowlist: ['git', 'yarn', 'npm'],
            globalBlocklist: ['rm -rf', 'sudo'],
            dockerMode: 'local',
            allowLocalOverrides: true,
          },
          offline: {
            cacheTtl: 86400, // 1 day
          },
        },
        merged: {
          llm: {
            provider: 'anthropic',
            model: 'claude-sonnet-4.5',
            temperature: 0.7,
            maxTokens: 8000,
          },
          teams: {
            enabled: true,
            apiUrl: this.baseURL,
            orgSlug: 'acme-corp',
            teamId: _teamId,
            features: {
              sharedTools: true,
              auditSync: true,
              llmProxy: false,
              cloudSandbox: false,
            },
          },
          enforcement: {
            allowedModels: ['claude-sonnet-4.5', 'deepseek-chat'],
            allowedProviders: ['anthropic', 'deepseek'],
            globalAllowlist: ['git', 'yarn', 'npm'],
            dockerMode: 'local',
          },
        },
      };
    },
  };

  /**
   * Mock audit, tools, llm endpoints (not needed for auth flow)
   */
  public readonly audit = {};
  public readonly tools = {};
  public readonly llm = {};

  /**
   * Token management (mock)
   */
  public setAccessToken(token: string): void {
    this.accessToken = token;
  }

  public clearAccessToken(): void {
    this.accessToken = undefined;
  }

  public getAccessToken(): string | undefined {
    return this.accessToken;
  }

  public getBaseURL(): string {
    return this.baseURL;
  }

  /**
   * Mock network delay for realism
   */
  private mockDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
