/**
 * OpenAPI code generation configuration
 *
 * Generates TypeScript types and client from OpenAPI spec.
 * Run: yarn generate
 */

import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: './openapi/teams-api.yaml',
  output: {
    path: './src/generated',
    format: 'prettier',
    lint: 'eslint',
  },
  client: {
    bundle: true, // Create a single client file
    name: 'TeamsAPIClient',
  },
  types: {
    dates: 'types+transform', // Convert date strings to Date objects
    enums: 'typescript', // Use TypeScript enums
    name: 'preserve', // Keep original names from OpenAPI
  },
  services: {
    asClass: true, // Generate services as classes
    name: '{{name}}Service', // Service naming pattern
    operationId: true, // Use operationId from spec
    response: 'body', // Return response body directly
  },
  schemas: {
    export: true, // Export schemas
    type: 'json', // JSON schemas (for runtime validation)
  },
});
