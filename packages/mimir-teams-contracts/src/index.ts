/**
 * @codedir/mimir-teams-contracts
 *
 * API contracts for Mimir Teams integration.
 *
 * Generated from OpenAPI specification (openapi/teams-api.yaml).
 *
 * This package provides:
 * - TypeScript types for all API entities (auto-generated)
 * - API client functions (auto-generated)
 * - Complete type safety for Teams backend API
 *
 * @example
 * ```typescript
 * import { login, type LoginRequest } from '@codedir/mimir-teams-contracts';
 *
 * const response = await login({
 *   body: {
 *     email: 'user@example.com',
 *     password: 'password123',
 *   }
 * });
 * ```
 */

// Export everything from generated code
export * from './generated/index.js';
