/**
 * Configuration source interface.
 *
 * Local mode: Only uses DefaultConfigSource, FileConfigSource, EnvConfigSource
 * Teams mode: Adds TeamsConfigSource with highest priority
 */

import type { Config } from '@/shared/config/schemas.js';

/**
 * Interface for configuration sources.
 *
 * Implementations:
 * - DefaultConfigSource (priority 0) - Hardcoded defaults
 * - EnvConfigSource (priority 30) - Environment variables
 * - FileConfigSource (priority 40/50) - Global/Project YAML files
 * - TeamsConfigSource (priority 100, ENFORCED) - Backend config
 */
export interface IConfigSource {
  /**
   * Human-readable name for debugging and logging
   * @example "default", "env", "global-file", "project-file", "teams"
   */
  name: string;

  /**
   * Priority level (higher = overrides lower)
   *
   * Standard priorities:
   * - 0: Default (hardcoded fallback)
   * - 30: Environment variables
   * - 40: Global file (~/.mimir/config.yml)
   * - 50: Project file (.mimir/config.yml)
   * - 100: Teams backend (highest, enforced)
   */
  priority: number;

  /**
   * Load configuration from this source
   *
   * @returns Partial configuration object (merged with other sources)
   * @throws Error if source is available but fails to load
   */
  load(): Promise<Partial<Config>>;

  /**
   * Check if this source is currently available
   *
   * Examples:
   * - File source: Check if file exists
   * - Teams source: Check if user is authenticated
   * - Env source: Always true
   *
   * @returns true if source can be loaded, false otherwise
   */
  isAvailable(): Promise<boolean>;

  /**
   * Whether this source enforces config (cannot be overridden by lower priority sources)
   *
   * Enforced sources:
   * - Apply specific merge rules (not simple deep merge)
   * - Override critical fields completely
   * - Used by Teams backend to enforce org/team policies
   *
   * Non-enforced sources:
   * - Use standard deep merge
   * - Can be overridden by higher priority sources
   *
   * @returns true if this source enforces config, false otherwise
   */
  isEnforced(): boolean;
}
