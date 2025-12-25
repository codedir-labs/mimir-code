/**
 * Database Manager using Drizzle ORM
 * Handles automatic initialization, migrations, and seeding
 */

import Database from 'better-sqlite3';
import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';
import { defaultPricing } from './seed.js';
import { dirname } from 'path';
import type { IFileSystem } from '../platform/IFileSystem.js';

export interface DatabaseConfig {
  path: string;
  verbose?: boolean;
  fileSystem?: IFileSystem;
}

/**
 * DatabaseManager with automatic initialization and migrations
 */
export class DatabaseManager {
  private sqlite: Database.Database;
  private db: BetterSQLite3Database<typeof schema>;
  private config: DatabaseConfig;

  private constructor(config: DatabaseConfig) {
    this.config = config;

    // Initialize SQLite connection
    this.sqlite = new Database(config.path, {
      verbose: config.verbose ? console.log : undefined,
    });

    // Enable WAL mode for better concurrency
    this.sqlite.pragma('journal_mode = WAL');
    this.sqlite.pragma('foreign_keys = ON');

    // Initialize Drizzle ORM
    this.db = drizzle(this.sqlite, { schema });

    // Auto-initialize database
    this.initialize();
  }

  /**
   * Create DatabaseManager instance with proper directory setup
   * Use this factory method instead of constructor for proper async initialization
   */
  static async create(config: DatabaseConfig): Promise<DatabaseManager> {
    // Ensure database directory exists using IFileSystem if provided
    const dbDir = dirname(config.path);

    if (config.fileSystem) {
      // Use platform abstraction
      const dirExists = await config.fileSystem.exists(dbDir);
      if (!dirExists) {
        await config.fileSystem.mkdir(dbDir, { recursive: true });
      }
    } else {
      // Fallback to sync fs for backwards compatibility (will be deprecated)
      // This path should only be used during transition period
      const { existsSync, mkdirSync } = await import('fs');
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
      }
    }

    return new DatabaseManager(config);
  }

  /**
   * Initialize database with migrations and seed data
   */
  private initialize(): void {
    try {
      // Run migrations if available
      this.runMigrations();

      // Seed initial data if database is empty
      this.seedDatabase();
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Run Drizzle migrations
   */
  private runMigrations(): void {
    try {
      // Check if migrations folder exists
      // Note: This is a sync check but migrations themselves are a build-time concern
      // TODO: Consider making entire initialization async if needed
      const migrationsFolder = './drizzle';
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { existsSync } = require('fs');
      if (existsSync(migrationsFolder)) {
        migrate(this.db, { migrationsFolder });
      } else {
        // No migrations yet - this is expected on first setup
        // Tables will be created by Drizzle push or manual migration
      }
    } catch (error) {
      // Migration errors are expected if tables don't exist yet
      // We'll create them manually in seedDatabase
      if (this.config.verbose) {
        console.log('No migrations to run, will use manual initialization');
      }
    }
  }

  /**
   * Seed database with initial data
   */
  private seedDatabase(): void {
    // Check if pricing table has data
    const pricingCount = this.sqlite
      .prepare("SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='pricing'")
      .get() as { count: number };

    if (pricingCount.count === 0) {
      // Tables don't exist yet - create them manually from schema
      this.createTablesManually();
    }

    // Check if pricing data exists
    const existingPricing = this.sqlite.prepare('SELECT COUNT(*) as count FROM pricing').get() as {
      count: number;
    };

    if (existingPricing.count === 0) {
      // Insert default pricing
      this.db.transaction((tx) => {
        for (const price of defaultPricing) {
          tx.insert(schema.pricing).values(price).run();
        }
      });

      if (this.config.verbose) {
        console.log(`Seeded ${defaultPricing.length} pricing entries`);
      }
    }

    // Insert initial migration record if not exists
    try {
      const migrationExists = this.sqlite
        .prepare('SELECT COUNT(*) as count FROM migrations WHERE version = ?')
        .get('1.0.0') as { count: number };

      if (migrationExists.count === 0) {
        this.db.insert(schema.migrations).values({ version: '1.0.0' }).run();
      }
    } catch (error) {
      // Migration table might not exist yet
    }
  }

  /**
   * Manually create tables from Drizzle schema
   * This is a fallback for when migrations don't exist yet
   */
  private createTablesManually(): void {
    // This is a temporary solution - in production, we'll use proper migrations
    // For now, we'll execute the raw SQL from schema.sql
    const createTablesSQL = `
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version TEXT NOT NULL UNIQUE,
        applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        total_tokens INTEGER DEFAULT 0,
        total_cost REAL DEFAULT 0.0,
        provider TEXT,
        model TEXT,
        status TEXT DEFAULT 'active' CHECK(status IN ('active', 'archived', 'deleted'))
      );

      CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
        content TEXT NOT NULL,
        timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        cost REAL DEFAULT 0.0,
        metadata TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

      CREATE TABLE IF NOT EXISTS tool_calls (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        message_id TEXT,
        tool_name TEXT NOT NULL,
        arguments TEXT NOT NULL,
        result TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'success', 'failed')),
        error TEXT,
        started_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        completed_at INTEGER,
        duration_ms INTEGER,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_tool_calls_conversation_id ON tool_calls(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_status ON tool_calls(status);
      CREATE INDEX IF NOT EXISTS idx_tool_calls_started_at ON tool_calls(started_at DESC);

      CREATE TABLE IF NOT EXISTS permissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT,
        command TEXT NOT NULL,
        risk_level TEXT NOT NULL CHECK(risk_level IN ('low', 'medium', 'high', 'critical')),
        decision TEXT NOT NULL CHECK(decision IN ('allow', 'deny', 'always', 'never')),
        user_confirmed INTEGER DEFAULT 0,
        timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        context TEXT,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_permissions_conversation_id ON permissions(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_permissions_timestamp ON permissions(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_permissions_decision ON permissions(decision);

      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        description TEXT,
        files_snapshot TEXT NOT NULL,
        git_diff TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_checkpoints_conversation_id ON checkpoints(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_created_at ON checkpoints(created_at DESC);

      CREATE TABLE IF NOT EXISTS cost_summary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        total_tokens INTEGER DEFAULT 0,
        input_tokens INTEGER DEFAULT 0,
        output_tokens INTEGER DEFAULT 0,
        total_cost REAL DEFAULT 0.0,
        request_count INTEGER DEFAULT 0,
        UNIQUE(date, provider, model)
      );

      CREATE INDEX IF NOT EXISTS idx_cost_summary_date ON cost_summary(date DESC);
      CREATE INDEX IF NOT EXISTS idx_cost_summary_provider ON cost_summary(provider);

      CREATE TABLE IF NOT EXISTS session_state (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        agent_state TEXT NOT NULL,
        iteration INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_session_state_conversation_id ON session_state(conversation_id);

      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        operation TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        conversation_id TEXT,
        session_id TEXT,
        provider TEXT,
        model TEXT,
        input_tokens INTEGER,
        output_tokens INTEGER,
        total_tokens INTEGER,
        cost REAL,
        tool_name TEXT,
        tool_args TEXT,
        tool_result_size INTEGER,
        query_type TEXT,
        table_name TEXT,
        rows_affected INTEGER,
        success INTEGER DEFAULT 1,
        error TEXT,
        memory_mb REAL,
        cpu_percent REAL,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_metrics_operation ON metrics(operation);
      CREATE INDEX IF NOT EXISTS idx_metrics_conversation_id ON metrics(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_metrics_provider ON metrics(provider);
      CREATE INDEX IF NOT EXISTS idx_metrics_success ON metrics(success);

      CREATE TABLE IF NOT EXISTS pricing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_price_per_1m REAL NOT NULL,
        output_price_per_1m REAL NOT NULL,
        effective_from INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
        effective_until INTEGER,
        currency TEXT DEFAULT 'USD',
        notes TEXT,
        UNIQUE(provider, model, effective_from)
      );

      CREATE INDEX IF NOT EXISTS idx_pricing_provider_model ON pricing(provider, model);
      CREATE INDEX IF NOT EXISTS idx_pricing_effective ON pricing(effective_from DESC);
    `;

    // Execute each statement
    const statements = createTablesSQL.split(';').filter((s) => s.trim());
    for (const statement of statements) {
      try {
        this.sqlite.exec(statement);
      } catch (error) {
        // Table might already exist
        if (this.config.verbose) {
          console.log('Table creation warning:', error);
        }
      }
    }

    if (this.config.verbose) {
      console.log('Database tables created successfully');
    }
  }

  /**
   * Get Drizzle database instance
   */
  getDb(): BetterSQLite3Database<typeof schema> {
    return this.db;
  }

  /**
   * Get raw SQLite database instance (for legacy code)
   */
  getSqlite(): Database.Database {
    return this.sqlite;
  }

  /**
   * Execute a raw SQL query (for backward compatibility)
   */
  execute(sql: string, params?: unknown[]): Database.RunResult {
    const stmt = this.sqlite.prepare(sql);
    return stmt.run(...(params || []));
  }

  /**
   * Query a raw SQL statement (for backward compatibility)
   */
  query<T = unknown>(sql: string, params?: unknown[]): T[] {
    const stmt = this.sqlite.prepare(sql);
    return stmt.all(...(params || [])) as T[];
  }

  /**
   * Run a transaction
   */
  transaction<T>(fn: (tx: BetterSQLite3Database<typeof schema>) => T): T {
    return this.db.transaction((tx) => fn(tx));
  }

  /**
   * Close database connection
   */
  close(): void {
    this.sqlite.close();
  }

  /**
   * Vacuum database to optimize storage
   */
  vacuum(): void {
    this.sqlite.exec('VACUUM');
  }

  /**
   * Get database statistics
   */
  getStats(): {
    pageCount: number;
    pageSize: number;
    sizeBytes: number;
    walMode: boolean;
  } {
    const pageCount = this.sqlite.pragma('page_count', { simple: true }) as number;
    const pageSize = this.sqlite.pragma('page_size', { simple: true }) as number;
    const journalMode = this.sqlite.pragma('journal_mode', { simple: true }) as string;

    return {
      pageCount,
      pageSize,
      sizeBytes: pageCount * pageSize,
      walMode: journalMode.toLowerCase() === 'wal',
    };
  }

  /**
   * Execute a query and return a single row
   */
  queryOne<T>(sql: string, params?: unknown[]): T | null {
    try {
      const stmt = this.sqlite.prepare(sql);
      const result = params ? stmt.get(...params) : stmt.get();
      return (result as T) || null;
    } catch (error) {
      console.error('Query failed:', error);
      return null;
    }
  }

  /**
   * Perform a database health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Run integrity check
      const result = this.sqlite.pragma('integrity_check', { simple: true });
      return result === 'ok';
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }
}

// Singleton instance for the application
let dbInstance: DatabaseManager | null = null;

/**
 * Get or create database manager instance
 * @deprecated Use getDatabaseManagerAsync instead for proper async initialization
 */
export function getDatabaseManager(config?: DatabaseConfig): DatabaseManager {
  if (!dbInstance && config) {
    // Legacy sync path - will use fallback sync fs operations
    // This is deprecated and should be replaced with getDatabaseManagerAsync
    throw new Error('getDatabaseManager is deprecated. Use getDatabaseManagerAsync instead.');
  }
  if (!dbInstance) {
    throw new Error(
      'DatabaseManager not initialized. Call getDatabaseManagerAsync with config first.'
    );
  }
  return dbInstance;
}

/**
 * Get or create database manager instance (async)
 * This is the preferred method as it properly uses platform abstractions
 */
export async function getDatabaseManagerAsync(config?: DatabaseConfig): Promise<DatabaseManager> {
  if (!dbInstance && config) {
    dbInstance = await DatabaseManager.create(config);
  }
  if (!dbInstance) {
    throw new Error('DatabaseManager not initialized. Call with config first.');
  }
  return dbInstance;
}

/**
 * Close database connection
 */
export function closeDatabaseManager(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
