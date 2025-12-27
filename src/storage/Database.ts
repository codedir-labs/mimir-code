/**
 * Database Manager using sql.js
 * Handles automatic initialization, migrations, and seeding
 */

import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { defaultPricing } from './seed.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';
import type { IFileSystem } from '../platform/IFileSystem.js';

export interface DatabaseConfig {
  path: string;
  verbose?: boolean;
  fileSystem?: IFileSystem;
}

interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

/**
 * Locate sql.js WASM file
 * Tries multiple locations in order:
 * 1. node_modules/sql.js/dist/ (for npm installs and development)
 * 2. resources/ directory (for standalone binaries)
 */
function locateWasmFile(): ArrayBuffer {
  const wasmFileName = 'sql-wasm.wasm';

  // Get module directory for npm package installations
  const currentDir = dirname(fileURLToPath(import.meta.url));

  // Location 1: node_modules (for npm global/local installs and development)
  // PRIORITY: Check this first because npm installs are more common
  const nodeModulesPaths = [
    // Relative to the built module (bundled dist/cli.mjs)
    join(currentDir, '..', 'node_modules', 'sql.js', 'dist', wasmFileName),
    // Relative to the built module (unbundled dist/storage/Database.js)
    join(currentDir, '..', '..', 'node_modules', 'sql.js', 'dist', wasmFileName),
    // Relative to current working directory (for local development)
    join(process.cwd(), 'node_modules', 'sql.js', 'dist', wasmFileName),
  ];

  for (const modulePath of nodeModulesPaths) {
    if (existsSync(modulePath)) {
      const buffer = readFileSync(modulePath);
      // Convert Node.js Buffer to ArrayBuffer
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
  }

  // Location 2: resources directory (for standalone binaries)
  // For Bun compiled binaries, process.argv[0] is the executable path
  // Standalone binaries will have: /path/to/mimir (executable) + /path/to/resources/sql-wasm.wasm
  const executablePath = process.argv[0] || process.execPath;
  const binaryDir = dirname(executablePath);

  const resourcesPaths = [
    // Next to the binary (same directory) - most common for our installers
    join(binaryDir, 'resources', wasmFileName),
    // For development/testing
    join(process.cwd(), 'resources', wasmFileName),
    // Parent directory of binary (for some install layouts)
    join(binaryDir, '..', 'resources', wasmFileName),
  ];

  for (const resourcePath of resourcesPaths) {
    if (existsSync(resourcePath)) {
      const buffer = readFileSync(resourcePath);
      // Convert Node.js Buffer to ArrayBuffer
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    }
  }

  // Enhanced error message with diagnostic information
  const diagnostics = [
    `import.meta.url: ${import.meta.url}`,
    `currentDir: ${currentDir}`,
    `process.argv[0]: ${process.argv[0]}`,
    `process.execPath: ${process.execPath}`,
    `executablePath: ${executablePath}`,
    `binaryDir: ${binaryDir}`,
    `process.cwd(): ${process.cwd()}`,
  ];

  throw new Error(
    `Could not locate ${wasmFileName}.\n\nDiagnostics:\n${diagnostics.join('\n')}\n\nTried:\n` +
      [...nodeModulesPaths, ...resourcesPaths].map((p) => `  - ${p}`).join('\n')
  );
}

/**
 * DatabaseManager with automatic initialization and migrations
 */
export class DatabaseManager {
  private db!: SqlJsDatabase;
  private config: DatabaseConfig;
  private SQL: any;
  private nodeFs: typeof import('fs') | null = null;

  private constructor(config: DatabaseConfig, SQL: any) {
    this.config = config;
    this.SQL = SQL;
  }

  /**
   * Create DatabaseManager instance with proper directory setup
   */
  static async create(config: DatabaseConfig): Promise<DatabaseManager> {
    // Ensure database directory exists
    const dbDir = dirname(config.path);

    if (config.fileSystem) {
      const dirExists = await config.fileSystem.exists(dbDir);
      if (!dirExists) {
        await config.fileSystem.mkdir(dbDir, { recursive: true });
      }
    } else {
      const { existsSync, mkdirSync } = await import('fs');
      if (!existsSync(dbDir)) {
        mkdirSync(dbDir, { recursive: true });
      }
    }

    // Initialize sql.js with WASM binary from file system
    const wasmBinary = locateWasmFile();
    const SQL = await initSqlJs({
      wasmBinary,
    });
    const manager = new DatabaseManager(config, SQL);

    // Load Node.js fs module for sync operations
    manager.nodeFs = await import('fs');

    // Load or create database
    await manager.loadDatabase();

    // Initialize schema and seed data
    manager.initialize();

    // Save database after initialization (creates tables and seeds data)
    await manager.save();

    return manager;
  }

  /**
   * Load database from file or create new
   */
  private async loadDatabase(): Promise<void> {
    try {
      if (this.config.fileSystem) {
        const exists = await this.config.fileSystem.exists(this.config.path);
        if (exists) {
          const buffer = await this.config.fileSystem.readFile(
            this.config.path,
            'binary' as BufferEncoding
          );
          const uint8Array = new Uint8Array(Buffer.from(buffer as any, 'binary'));
          this.db = new this.SQL.Database(uint8Array);
          if (this.config.verbose) {
            console.log('Loaded existing database from', this.config.path);
          }
        } else {
          this.db = new this.SQL.Database();
          if (this.config.verbose) {
            console.log('Created new database');
          }
        }
      } else {
        const { existsSync, readFileSync } = await import('fs');
        if (existsSync(this.config.path)) {
          const buffer = readFileSync(this.config.path);
          this.db = new this.SQL.Database(buffer);
        } else {
          this.db = new this.SQL.Database();
        }
      }
    } catch (error) {
      this.db = new this.SQL.Database();
      if (this.config.verbose) {
        console.log('Created new database after error:', error);
      }
    }
  }

  /**
   * Save database to disk (async version)
   */
  async save(): Promise<void> {
    const data = this.db.export();
    const buffer = Buffer.from(data);

    if (this.config.fileSystem) {
      await this.config.fileSystem.writeFile(
        this.config.path,
        buffer.toString('binary'),
        'binary' as BufferEncoding
      );
    } else {
      const { writeFileSync } = await import('fs');
      writeFileSync(this.config.path, buffer);
    }
  }

  /**
   * Save database to disk (sync version for auto-save)
   * Uses sync fs operations to avoid async in execute/transaction
   */
  private saveSync(): void {
    const data = this.db.export();
    const buffer = Buffer.from(data);

    // Use pre-loaded Node.js fs module for sync operations
    if (this.nodeFs) {
      this.nodeFs.writeFileSync(this.config.path, buffer);
    }
  }

  /**
   * Initialize database with migrations and seed data
   */
  private initialize(): void {
    try {
      this.createTablesManually();
      this.seedDatabase();
    } catch (error) {
      console.error('Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Manually create tables from schema
   */
  private createTablesManually(): void {
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

    const statements = createTablesSQL.split(';').filter((s) => s.trim());
    for (const statement of statements) {
      try {
        this.db.run(statement);
      } catch (error) {
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
   * Seed database with initial data
   */
  private seedDatabase(): void {
    const pricingCount = this.db.exec(
      "SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name='pricing'"
    );

    if (pricingCount.length === 0 || pricingCount[0]?.values[0]?.[0] === 0) {
      this.createTablesManually();
    }

    const existingPricing = this.db.exec('SELECT COUNT(*) as count FROM pricing');
    const count = existingPricing.length > 0 ? existingPricing[0]?.values[0]?.[0] : 0;

    if (count === 0) {
      for (const price of defaultPricing) {
        const stmt = this.db.prepare(
          `INSERT INTO pricing (provider, model, input_price_per_1m, output_price_per_1m, effective_from, currency)
           VALUES (?, ?, ?, ?, ?, ?)`
        );
        // sql.js doesn't accept undefined - convert to null or use defaults
        const effectiveFrom = price.effectiveFrom
          ? typeof price.effectiveFrom === 'number'
            ? price.effectiveFrom
            : Math.floor(price.effectiveFrom.getTime() / 1000)
          : Math.floor(Date.now() / 1000);

        stmt.run([
          price.provider,
          price.model,
          price.inputPricePer1M,
          price.outputPricePer1M,
          effectiveFrom,
          price.currency ?? 'USD',
        ]);
        stmt.free();
      }

      if (this.config.verbose) {
        console.log(`Seeded ${defaultPricing.length} pricing entries`);
      }
    }

    try {
      const migrationExists = this.db.exec(
        "SELECT COUNT(*) as count FROM migrations WHERE version = '1.0.0'"
      );
      const migCount = migrationExists.length > 0 ? migrationExists[0]?.values[0]?.[0] : 0;

      if (migCount === 0) {
        this.db.run("INSERT INTO migrations (version) VALUES ('1.0.0')");
      }
    } catch (error) {
      // Migration table might not exist yet
    }
  }

  /**
   * Execute a raw SQL query (auto-saves for write operations)
   */
  execute(sql: string, params?: unknown[]): RunResult {
    const stmt = this.db.prepare(sql);
    stmt.bind((params || []) as (string | number | null | Uint8Array)[]);
    stmt.step();
    const info = this.db.getRowsModified();
    stmt.free();

    // Auto-save for write operations (INSERT, UPDATE, DELETE)
    const isWrite = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i.test(sql);
    if (isWrite && info > 0) {
      // Save synchronously (sql.js export is sync, fs write would be async but we'll handle that)
      this.saveSync();
    }

    return {
      changes: info,
      lastInsertRowid: 0, // sql.js doesn't provide this easily
    };
  }

  /**
   * Query a raw SQL statement
   */
  query<T = unknown>(sql: string, params?: unknown[]): T[] {
    const stmt = this.db.prepare(sql);
    stmt.bind((params || []) as (string | number | null | Uint8Array)[]);
    const results: T[] = [];

    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push(row as T);
    }
    stmt.free();
    return results;
  }

  /**
   * Execute a query and return a single row
   */
  queryOne<T>(sql: string, params?: unknown[]): T | null {
    try {
      const stmt = this.db.prepare(sql);
      stmt.bind((params || []) as (string | number | null | Uint8Array)[]);
      if (stmt.step()) {
        const row = stmt.getAsObject();
        stmt.free();
        return row as T;
      }
      stmt.free();
      return null;
    } catch (error) {
      console.error('Query failed:', error);
      return null;
    }
  }

  /**
   * Run a transaction (auto-saves after commit)
   */
  transaction<T>(fn: (db: DatabaseManager) => T): T {
    this.db.run('BEGIN TRANSACTION');
    try {
      const result = fn(this);
      this.db.run('COMMIT');
      // Save after successful commit
      this.saveSync();
      return result;
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  /**
   * Close database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Vacuum database to optimize storage
   */
  vacuum(): void {
    this.db.run('VACUUM');
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
    const pageCount = this.queryOne<{ page_count: number }>('PRAGMA page_count');
    const pageSize = this.queryOne<{ page_size: number }>('PRAGMA page_size');

    return {
      pageCount: pageCount?.page_count || 0,
      pageSize: pageSize?.page_size || 0,
      sizeBytes: (pageCount?.page_count || 0) * (pageSize?.page_size || 0),
      walMode: false, // sql.js doesn't support WAL mode
    };
  }

  /**
   * Perform a database health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const result = this.queryOne<{ integrity_check: string }>('PRAGMA integrity_check');
      return result?.integrity_check === 'ok';
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }
}

// Singleton instance for the application
let dbInstance: DatabaseManager | null = null;

/**
 * Get or create database manager instance (async)
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
