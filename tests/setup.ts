/**
 * Vitest setup file
 * Runs before all tests
 */

import { beforeAll, afterAll, afterEach } from 'vitest';

beforeAll(() => {
  // Setup before all tests
  console.log('Test suite starting...');
});

afterEach(() => {
  // Cleanup after each test
});

afterAll(() => {
  // Cleanup after all tests
  console.log('Test suite completed.');
});
