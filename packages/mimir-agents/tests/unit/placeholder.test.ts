import { describe, it, expect } from 'vitest';
import { CORE_VERSION } from '../../src/core/index.js';

describe('Placeholder Test', () => {
  it('should export core version', () => {
    expect(CORE_VERSION).toBe('0.1.0');
  });
});
