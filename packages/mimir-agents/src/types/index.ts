/**
 * Core type definitions for Mimir
 */

// Message content types for multi-part messages (text + images)
export type MessageContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }; // base64 data URL or http(s) URL

export type MessageContent = string | MessageContentPart[];

// Message types
export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: MessageContent; // Can be string or array of parts (text + images)
  name?: string;
  toolCalls?: ToolCall[];
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  timestamp?: number; // Unix timestamp in milliseconds
  duration?: number; // Duration in milliseconds
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  cost?: number; // Cost in USD
  model?: string; // Model used for this message
  provider?: string; // Provider used for this message
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// Chat response types
export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error';
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface ChatChunk {
  content: string;
  done: boolean;
}

// Risk assessment
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface PermissionDecision {
  command: string;
  riskLevel: RiskLevel;
  decision: 'allow' | 'deny' | 'always' | 'never';
  timestamp: number;
}

// Agent action types
export interface Action {
  type: 'tool_call' | 'finish';
  toolName?: string;
  arguments?: Record<string, unknown>;
  result?: unknown;
}

export interface Observation {
  type: 'tool_result' | 'permission_denied' | 'error';
  data?: unknown;
  error?: string;
}

// Configuration types (will be refined with Zod schemas)
export interface LLMConfig {
  provider: string;
  model: string;
  apiKey?: string;
  baseURL?: string;
  temperature: number;
  maxTokens: number;
}

export interface PermissionsConfig {
  autoAccept: boolean;
  acceptRiskLevel: RiskLevel;
  alwaysAcceptCommands: string[];
}

export interface DockerConfig {
  enabled: boolean;
  baseImage: string;
  cpuLimit?: number;
  memoryLimit?: string;
}

// Result type for error handling
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

// Utility type helpers
export const createOk = <T>(value: T): Result<T> => ({ ok: true, value });
export const createErr = <E = Error>(error: E): Result<never, E> => ({ ok: false, error });
