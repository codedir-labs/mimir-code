// Type declaration for @codedir/mimir-teams-contracts
// This package uses tsup without dts generation
declare module '@codedir/mimir-teams-contracts' {
  export const client: unknown;

  // Auth types
  export interface User {
    id: string;
    email: string;
    fullName: string;
    createdAt: string;
    organizations: UserOrganization[];
  }

  // Organization membership info returned with user
  export interface UserOrganization {
    orgId: string;
    orgSlug: string;
    orgName: string;
    role: string;
    email: string;
  }

  // Full organization details
  export interface Organization {
    id: string;
    slug: string;
    name: string;
    subscriptionTier?: string;
    role?: string;
    userEmail?: string;
    ssoProvider?: string;
    budget?: {
      monthlyLimit: number;
      currentUsage: number;
      remaining: number;
    };
    memberCount?: number;
    teamCount?: number;
    createdAt: string;
    updatedAt: string;
  }

  export interface LoginRequest {
    email: string;
    password: string;
  }

  export interface LoginResponse {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: User;
    orgSecret?: string;
  }

  export interface RefreshRequest {
    refreshToken: string;
  }

  export interface RefreshResponse {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }

  export interface LogoutRequest {
    refreshToken?: string;
  }

  export interface LogoutResponse {
    success: boolean;
  }

  export interface OrganizationAuthResponse {
    orgAccessToken: string;
    organization: Organization;
  }

  export interface SSORequiredResponse {
    requiresSSO: boolean;
    ssoProvider: string;
    ssoUrl: string;
  }

  export interface ListOrganizationsResponse {
    organizations: Organization[];
  }

  export interface GetOrganizationResponse {
    organization: Organization;
  }

  export interface ConfigResponse {
    organization: {
      apiUrl: string;
      slug: string;
      name: string;
      enforcement: {
        allowedModels: string[];
        blockedModels: string[];
        allowedProviders: string[];
        globalAllowlist: string[];
        globalBlocklist: string[];
        dockerMode: string;
        allowLocalOverrides: boolean;
      };
      offline: {
        cacheTtl: number;
      };
    };
    merged: {
      llm: {
        provider: string;
        model: string;
        temperature: number;
        maxTokens: number;
      };
      teams: {
        enabled: boolean;
        apiUrl: string;
        orgSlug: string;
        teamId?: string;
        features: {
          sharedTools: boolean;
          auditSync: boolean;
          llmProxy: boolean;
          cloudSandbox: boolean;
        };
      };
      enforcement: {
        allowedModels: string[];
        allowedProviders: string[];
        globalAllowlist: string[];
        dockerMode: string;
      };
    };
  }

  export type GetConfigResponse = ConfigResponse;

  export interface Team {
    id: string;
    orgId: string;
    slug: string;
    name: string;
    description?: string;
    repository?: string;
    role: string;
    memberCount: number;
    budget?: {
      monthlyLimit: number;
      currentUsage: number;
      remaining: number;
    };
    createdAt: string;
    updatedAt: string;
  }

  export interface ListTeamsResponse {
    teams: Team[];
  }

  export interface DetectTeamRequest {
    repository: string;
  }

  export interface DetectedTeam {
    teamId: string;
    teamSlug: string;
    teamName: string;
    role: string;
  }

  export interface DetectTeamResponse {
    teams: DetectedTeam[];
  }

  export interface ApiError {
    code: string;
    message: string;
  }
}
