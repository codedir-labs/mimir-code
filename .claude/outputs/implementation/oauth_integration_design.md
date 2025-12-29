# OAuth Integration Design for Anthropic Subscriptions

**Date:** 2025-12-29
**Status:** Design Proposal

## Overview

Design for adding OAuth-based authentication to use Anthropic subscriptions (paid tiers) instead of API keys. This would allow users to authenticate via their existing Anthropic account and use their subscription quota.

## Current Architecture

### API Key Flow
```
User → mimir connect anthropic
     → Enter API key (sk-ant-...)
     → Store in keychain/file
     → Direct API calls to api.anthropic.com
```

### Limitations
- Requires users to generate API keys in console
- Separate billing from main Anthropic subscription
- No access to subscription features
- Manual key rotation

## OAuth Flow Design

### 1. Browser-Based Authentication

```
User → mimir connect anthropic --oauth
     → Opens browser to anthropic.com/oauth/authorize
     → User logs in with Anthropic account
     → User grants permission to Mimir
     → Redirect to localhost callback
     → Exchange code for tokens
     → Store refresh token securely
```

### 2. Token Management

```typescript
interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string[];
}

interface OAuthConfig {
  clientId: string;
  clientSecret?: string; // Optional for PKCE
  redirectUri: string;
  scopes: string[];
}
```

### 3. Implementation Components

#### A. OAuth Manager
```typescript
// Location: src/features/auth/oauth/OAuthManager.ts

class OAuthManager {
  /**
   * Initiate OAuth flow
   * Opens browser and starts local server for callback
   */
  async initiateFlow(provider: string): Promise<OAuthTokens>;

  /**
   * Refresh expired access token
   */
  async refreshToken(provider: string, refreshToken: string): Promise<OAuthTokens>;

  /**
   * Revoke OAuth access
   */
  async revokeAccess(provider: string): Promise<void>;

  /**
   * Check if token is valid/expired
   */
  isTokenValid(tokens: OAuthTokens): boolean;
}
```

#### B. Local Callback Server
```typescript
// Location: src/features/auth/oauth/CallbackServer.ts

class CallbackServer {
  private server: http.Server;
  private port: number = 8080;

  /**
   * Start temporary server to receive OAuth callback
   */
  async start(): Promise<string>; // Returns authorization code

  /**
   * Stop callback server after receiving code
   */
  async stop(): Promise<void>;

  /**
   * Handle callback request
   */
  private handleCallback(req, res): void;
}
```

#### C. Token Storage
```typescript
// Location: src/shared/utils/TokenStorage.ts

class TokenStorage {
  /**
   * Store OAuth tokens securely
   * Uses keychain (macOS/Linux) or DPAPI (Windows)
   */
  async storeTokens(provider: string, tokens: OAuthTokens): Promise<void>;

  /**
   * Retrieve OAuth tokens
   */
  async getTokens(provider: string): Promise<OAuthTokens | null>;

  /**
   * Delete OAuth tokens
   */
  async deleteTokens(provider: string): Promise<void>;
}
```

#### D. Provider Adapter
```typescript
// Location: packages/mimir-agents-runtime/src/providers/oauth/AnthropicOAuth.ts

class AnthropicOAuthProvider implements ILLMProvider {
  private oauthManager: OAuthManager;
  private tokenStorage: TokenStorage;

  /**
   * Make authenticated API call
   * Auto-refreshes token if expired
   */
  async chat(messages: Message[], tools?: LLMTool[]): Promise<ChatResponse>;

  /**
   * Get access token (refresh if needed)
   */
  private async getAccessToken(): Promise<string>;
}
```

## Provider-Specific Implementation

### Anthropic OAuth

**Current Status:** ❌ Not Available
**Anthropic's OAuth Support:** As of Dec 2025, Anthropic does not publicly offer OAuth for their API.

**Alternative Approaches:**

1. **API Key with Subscription Link**
   - Allow users to link API key to subscription
   - Detect subscription tier from API headers
   - Apply subscription-specific rate limits

2. **Console SSO Integration** (Future)
   - If Anthropic adds OAuth
   - Integrate with console.anthropic.com SSO
   - Access subscription benefits via OAuth

3. **Proxy Authentication** (Teams Feature)
   - Mimir Teams server proxies requests
   - Teams server uses organization OAuth
   - Individual users authenticate to Teams

### OpenAI OAuth (Example - Works Today)

OpenAI has OAuth support for ChatGPT Enterprise:

```typescript
const OPENAI_OAUTH_CONFIG: OAuthConfig = {
  clientId: process.env.OPENAI_OAUTH_CLIENT_ID!,
  redirectUri: 'http://localhost:8080/callback',
  authorizationEndpoint: 'https://auth.openai.com/authorize',
  tokenEndpoint: 'https://auth.openai.com/token',
  scopes: ['openai.api.read', 'openai.api.write'],
};
```

## Implementation Plan

### Phase 1: OAuth Infrastructure
- [ ] Create OAuthManager class
- [ ] Implement local callback server
- [ ] Secure token storage (keychain/DPAPI)
- [ ] Browser launching utility

### Phase 2: Provider Integration
- [ ] Extend ProviderFactory for OAuth
- [ ] Create OAuth-specific provider adapters
- [ ] Auto-refresh token logic
- [ ] Error handling for expired/invalid tokens

### Phase 3: CLI Updates
- [ ] Add `--oauth` flag to `mimir connect`
- [ ] OAuth status in `mimir providers --list`
- [ ] `mimir auth logout` to revoke tokens
- [ ] Better error messages for OAuth issues

### Phase 4: UI/UX
- [ ] Visual feedback during OAuth flow
- [ ] Browser instructions if auto-open fails
- [ ] Token expiration warnings
- [ ] Re-authentication prompts

## Security Considerations

### Token Storage
- **macOS:** Use Keychain Services
- **Linux:** Use Secret Service API (libsecret)
- **Windows:** Use DPAPI (Data Protection API)
- **Fallback:** Encrypted file with machine-specific key

### PKCE (Proof Key for Code Exchange)
```typescript
// Generate code verifier and challenge
const codeVerifier = generateRandomString(128);
const codeChallenge = base64url(sha256(codeVerifier));

// Authorization URL
const authUrl = `${authEndpoint}?` +
  `client_id=${clientId}&` +
  `redirect_uri=${redirectUri}&` +
  `response_type=code&` +
  `code_challenge=${codeChallenge}&` +
  `code_challenge_method=S256`;
```

### Token Refresh
- Auto-refresh before expiration
- Retry logic for network failures
- Clear expired tokens
- Re-authenticate if refresh fails

## Configuration Schema

```yaml
# .mimir/config.yml

llm:
  provider: anthropic
  authMethod: oauth  # or 'api-key'

oauth:
  anthropic:
    clientId: mimir-cli
    redirectUri: http://localhost:8080/callback
    scopes:
      - api.read
      - api.write
```

## User Experience

### Initial Setup
```bash
$ mimir connect anthropic --oauth

🔐 Authenticating with Anthropic...

Opening browser to: https://console.anthropic.com/oauth/authorize

If the browser doesn't open, visit the URL above manually.

Waiting for authentication... ⏳

✓ Authentication successful!
✓ Tokens stored securely
✓ Using subscription: Claude Pro ($20/mo)

You can now use Mimir with your Anthropic subscription.
```

### Token Expiration
```bash
$ mimir

⚠️  Your Anthropic access token has expired.
Re-authenticating...

Opening browser... ✓
✓ Re-authenticated successfully

Starting chat session...
```

### Logout
```bash
$ mimir auth logout anthropic

Revoking access to Anthropic... ✓
Tokens deleted from keychain ✓

Run `mimir connect anthropic --oauth` to re-authenticate.
```

## API Changes

### CredentialsResolver Extension
```typescript
type AuthMethod = 'api-key' | 'oauth';

interface AuthCredentials {
  method: AuthMethod;
  value: string; // API key or access token
}

type CredentialsResolver = (
  provider: string
) => Promise<AuthCredentials | null>;
```

### ProviderFactory Enhancement
```typescript
class ProviderFactory {
  static async createFromConfig(
    config: ProviderFactoryConfig,
    credentialsResolver: CredentialsResolver,
    oauthManager?: OAuthManager  // Optional OAuth support
  ): Promise<ILLMProvider>;
}
```

## Testing Strategy

### Unit Tests
- Token refresh logic
- PKCE code generation
- Token validation
- Storage encryption

### Integration Tests
- Mock OAuth server
- Full auth flow simulation
- Token expiration handling
- Error scenarios

### Manual Tests
- Real OAuth with OpenAI (has OAuth)
- Browser launch on different OS
- Callback server on different ports
- Token storage across machines

## Alternatives Considered

### 1. Embedded Browser
**Pros:** No localhost server needed
**Cons:** Complex, platform-specific WebView

### 2. Device Code Flow
**Pros:** Works without callback
**Cons:** Worse UX, not supported by Anthropic

### 3. Service Account Keys
**Pros:** Simple, no OAuth needed
**Cons:** Not available for Anthropic

## Future Enhancements

### Multiple Accounts
```bash
mimir connect anthropic --oauth --account work
mimir connect anthropic --oauth --account personal
```

### Token Sharing (Teams)
```bash
# Share organization OAuth tokens via Teams
mimir teams login
# Auto-uses org OAuth for all providers
```

### SSO Integration
```bash
# Use company SSO for provider access
mimir connect anthropic --sso okta
```

## References

- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [PKCE RFC 7636](https://tools.ietf.org/html/rfc7636)
- [OpenAI OAuth Docs](https://platform.openai.com/docs/guides/production-best-practices/oauth)
- [Anthropic API Docs](https://docs.anthropic.com/claude/reference/getting-started-with-the-api)

## Conclusion

OAuth integration is **technically feasible** but **blocked by provider support**:

1. **Anthropic:** ❌ No OAuth available (API keys only)
2. **OpenAI:** ✅ OAuth available for Enterprise
3. **Google:** ✅ OAuth available (standard Google OAuth)
4. **DeepSeek:** ❌ No OAuth (API keys only)

**Recommendation:**
- Implement OAuth infrastructure now (generic)
- Start with Google Gemini (has OAuth)
- Add Anthropic when/if they add OAuth support
- Consider Mimir Teams proxy as interim solution for subscription access
