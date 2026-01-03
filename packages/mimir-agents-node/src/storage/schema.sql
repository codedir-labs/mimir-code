-- Mimir SQLite Database Schema
-- Version: 1.0.0

-- Migrations table to track schema versions
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version TEXT NOT NULL UNIQUE,
  applied_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Conversations table
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

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant')),
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cost REAL DEFAULT 0.0,
  metadata TEXT, -- JSON string for additional metadata
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

-- Tool calls table
CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  message_id TEXT,
  tool_name TEXT NOT NULL,
  arguments TEXT NOT NULL, -- JSON string
  result TEXT, -- JSON string
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

-- Permissions audit trail table
CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT,
  command TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK(risk_level IN ('low', 'medium', 'high', 'critical')),
  decision TEXT NOT NULL CHECK(decision IN ('allow', 'deny', 'always', 'never')),
  user_confirmed BOOLEAN DEFAULT 0,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  context TEXT, -- JSON string for additional context
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_permissions_conversation_id ON permissions(conversation_id);
CREATE INDEX IF NOT EXISTS idx_permissions_timestamp ON permissions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_permissions_decision ON permissions(decision);

-- Checkpoints table (for undo/restore functionality)
CREATE TABLE IF NOT EXISTS checkpoints (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  description TEXT,
  files_snapshot TEXT NOT NULL, -- JSON string of file paths and hashes
  git_diff TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_checkpoints_conversation_id ON checkpoints(conversation_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_created_at ON checkpoints(created_at DESC);

-- Cost tracking summary table (for analytics)
CREATE TABLE IF NOT EXISTS cost_summary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, -- YYYY-MM-DD format
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

-- Session state table (for resuming interrupted sessions)
CREATE TABLE IF NOT EXISTS session_state (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  agent_state TEXT NOT NULL, -- JSON string of agent state
  iteration INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_state_conversation_id ON session_state(conversation_id);

-- Triggers to update timestamps

CREATE TRIGGER IF NOT EXISTS update_conversation_timestamp
AFTER UPDATE ON conversations
FOR EACH ROW
BEGIN
  UPDATE conversations SET updated_at = strftime('%s', 'now') WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_conversation_tokens
AFTER INSERT ON messages
FOR EACH ROW
BEGIN
  UPDATE conversations
  SET total_tokens = total_tokens + NEW.input_tokens + NEW.output_tokens,
      total_cost = total_cost + NEW.cost
  WHERE id = NEW.conversation_id;
END;

CREATE TRIGGER IF NOT EXISTS update_cost_summary
AFTER INSERT ON messages
FOR EACH ROW
WHEN NEW.input_tokens > 0 OR NEW.output_tokens > 0
BEGIN
  INSERT INTO cost_summary (date, provider, model, total_tokens, input_tokens, output_tokens, total_cost, request_count)
  SELECT
    date('now'),
    c.provider,
    c.model,
    NEW.input_tokens + NEW.output_tokens,
    NEW.input_tokens,
    NEW.output_tokens,
    NEW.cost,
    1
  FROM conversations c
  WHERE c.id = NEW.conversation_id
  ON CONFLICT(date, provider, model) DO UPDATE SET
    total_tokens = total_tokens + excluded.total_tokens,
    input_tokens = input_tokens + excluded.input_tokens,
    output_tokens = output_tokens + excluded.output_tokens,
    total_cost = total_cost + excluded.total_cost,
    request_count = request_count + 1;
END;

-- Metrics table for performance monitoring and analytics
CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  operation TEXT NOT NULL,         -- 'llm.chat', 'tool.execute', 'db.query'
  duration_ms INTEGER NOT NULL,

  -- Context
  conversation_id TEXT,
  session_id TEXT,

  -- LLM specific
  provider TEXT,                   -- 'deepseek', 'anthropic', etc.
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  cost REAL,

  -- Tool specific
  tool_name TEXT,
  tool_args TEXT,                  -- JSON
  tool_result_size INTEGER,        -- bytes

  -- DB specific
  query_type TEXT,                 -- 'SELECT', 'INSERT', etc.
  table_name TEXT,
  rows_affected INTEGER,

  -- Result
  success BOOLEAN DEFAULT 1,
  error TEXT,

  -- Resource usage
  memory_mb REAL,
  cpu_percent REAL,

  -- Additional metadata
  metadata TEXT                    -- JSON for extensibility
);

CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_operation ON metrics(operation);
CREATE INDEX IF NOT EXISTS idx_metrics_conversation_id ON metrics(conversation_id);
CREATE INDEX IF NOT EXISTS idx_metrics_provider ON metrics(provider);
CREATE INDEX IF NOT EXISTS idx_metrics_success ON metrics(success);

-- Pricing table for dynamic LLM cost calculation
CREATE TABLE IF NOT EXISTS pricing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_price_per_1m REAL NOT NULL,  -- USD per 1M input tokens
  output_price_per_1m REAL NOT NULL, -- USD per 1M output tokens
  effective_from INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  effective_until INTEGER,           -- NULL = current price
  currency TEXT DEFAULT 'USD',
  notes TEXT,
  UNIQUE(provider, model, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_pricing_provider_model ON pricing(provider, model);
CREATE INDEX IF NOT EXISTS idx_pricing_effective ON pricing(effective_from DESC);

-- Insert default pricing (as of January 2025)
INSERT OR IGNORE INTO pricing (provider, model, input_price_per_1m, output_price_per_1m, notes) VALUES
  ('deepseek', 'deepseek-chat', 0.14, 0.28, 'DeepSeek-V3 pricing'),
  ('deepseek', 'deepseek-coder', 0.14, 0.28, 'DeepSeek Coder pricing'),
  ('anthropic', 'claude-3-5-sonnet-20241022', 3.00, 15.00, 'Claude 3.5 Sonnet'),
  ('anthropic', 'claude-3-5-haiku-20241022', 0.80, 4.00, 'Claude 3.5 Haiku'),
  ('anthropic', 'claude-3-opus-20240229', 15.00, 75.00, 'Claude 3 Opus'),
  ('openai', 'gpt-4-turbo', 10.00, 30.00, 'GPT-4 Turbo'),
  ('openai', 'gpt-4o', 2.50, 10.00, 'GPT-4o'),
  ('openai', 'gpt-4o-mini', 0.15, 0.60, 'GPT-4o Mini'),
  ('openai', 'gpt-3.5-turbo', 0.50, 1.50, 'GPT-3.5 Turbo'),
  ('google', 'gemini-2.0-flash-exp', 0.00, 0.00, 'Free during preview'),
  ('google', 'gemini-1.5-pro', 1.25, 5.00, 'Gemini 1.5 Pro'),
  ('google', 'gemini-1.5-flash', 0.075, 0.30, 'Gemini 1.5 Flash'),
  ('qwen', 'qwen-max', 0.40, 1.20, 'Qwen Max estimated pricing'),
  ('qwen', 'qwen-plus', 0.20, 0.60, 'Qwen Plus estimated pricing'),
  ('ollama', 'llama3', 0.00, 0.00, 'Local model - no API costs'),
  ('ollama', 'mistral', 0.00, 0.00, 'Local model - no API costs'),
  ('ollama', 'codellama', 0.00, 0.00, 'Local model - no API costs');

-- Insert initial migration record
INSERT OR IGNORE INTO migrations (version) VALUES ('1.0.0');
