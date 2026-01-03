/**
 * Unified Provider - Single implementation using Vercel AI SDK
 *
 * Replaces manual provider implementations (AnthropicProvider, DeepSeekProvider)
 * with a unified approach using the AI SDK.
 */

import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText, type LanguageModel } from 'ai';
import type {
  ILLMProvider,
  Message,
  LLMTool,
  ChatResponse,
  ChatChunk,
} from '@codedir/mimir-agents';
import {
  getProvider,
  getModel,
  type ProviderDefinition,
  type ModelDefinition,
} from '@codedir/mimir-agents';
import { applyProviderLoader, applyAfterCreate } from './loaders.js';

/**
 * Configuration for UnifiedProvider
 */
export interface UnifiedProviderConfig {
  provider: string;
  model: string;
  apiKey: string;
  temperature?: number;
  maxTokens?: number;
  baseURL?: string; // Override for openai-compatible
  headers?: Record<string, string>; // Custom headers (added by loaders)
  projectId?: string; // For Google Gemini
  [key: string]: any; // Allow additional provider-specific options
}

/**
 * Unified LLM Provider using Vercel AI SDK
 */
export class UnifiedProvider implements ILLMProvider {
  private model: LanguageModel;
  private providerDef: ProviderDefinition;
  private modelDef: ModelDefinition;
  private config: UnifiedProviderConfig;

  private constructor(
    config: UnifiedProviderConfig,
    providerDef: ProviderDefinition,
    modelDef: ModelDefinition,
    model: LanguageModel
  ) {
    this.config = config;
    this.providerDef = providerDef;
    this.modelDef = modelDef;
    this.model = model;
  }

  /**
   * Create UnifiedProvider instance with provider loaders applied
   */
  static async create(config: UnifiedProviderConfig): Promise<UnifiedProvider> {
    // Get provider and model metadata
    const providerDef = getProvider(config.provider);
    if (!providerDef) {
      throw new Error(
        `Provider "${config.provider}" not found in registry. ` +
          `Run: mimir connect ${config.provider}`
      );
    }

    const modelDef = getModel(config.provider, config.model);
    if (!modelDef) {
      throw new Error(
        `Model "${config.model}" not found for provider "${config.provider}". ` +
          `Available models: ${providerDef.models.map((m) => m.id).join(', ')}`
      );
    }

    // Apply provider loader hooks
    const modifiedConfig = await applyProviderLoader(config.provider, config);

    // Create model instance
    const model = await UnifiedProvider.createModelInstance(modifiedConfig, providerDef, modelDef);

    // Apply afterCreate hook
    const finalModel = await applyAfterCreate(config.provider, model, modifiedConfig);

    return new UnifiedProvider(modifiedConfig, providerDef, modelDef, finalModel);
  }

  /**
   * Create AI SDK model instance
   */
  private static async createModelInstance(
    config: UnifiedProviderConfig,
    providerDef: ProviderDefinition,
    modelDef: ModelDefinition
  ): Promise<LanguageModel> {
    const { apiKey, headers } = config;
    const baseModel = UnifiedProvider.getBaseModelId(modelDef, config.model);

    // Prepare SDK-specific options
    const sdkOptions: any = { apiKey };
    if (headers) {
      sdkOptions.headers = headers;
    }

    switch (providerDef.sdkType) {
      case 'anthropic': {
        const provider = createAnthropic(sdkOptions);
        return provider(baseModel);
      }

      case 'openai': {
        const provider = createOpenAI(sdkOptions);
        return provider(baseModel);
      }

      case 'google': {
        // Google Gemini supports projectId
        if (config.projectId) {
          sdkOptions.project = config.projectId;
        }
        const provider = createGoogleGenerativeAI(sdkOptions);
        return provider(baseModel);
      }

      case 'mistral': {
        const provider = createMistral(sdkOptions);
        return provider(baseModel);
      }

      case 'openai-compatible': {
        const baseURL = config.baseURL || providerDef.baseURL;
        if (!baseURL) {
          throw new Error(
            `Provider "${config.provider}" requires a baseURL for OpenAI-compatible mode`
          );
        }
        const provider = createOpenAICompatible({ ...sdkOptions, baseURL });
        return provider(baseModel);
      }

      default:
        throw new Error(`Unsupported SDK type: ${providerDef.sdkType}`);
    }
  }

  /**
   * Get base model ID (strip variant suffix if present)
   *
   * E.g., "claude-opus-4-5-20251101-thinking" → "claude-opus-4-5-20251101"
   */
  private static getBaseModelId(modelDef: ModelDefinition, modelId: string): string {
    // If model has features, it might be a variant
    if (modelDef.features) {
      // Check if there's a base model in the registry
      const baseModelId = modelId.replace(/-(thinking|reasoning)$/, '');
      if (baseModelId !== modelId) {
        return baseModelId;
      }
    }

    return modelId;
  }

  /**
   * Chat completion
   */
  async chat(messages: Message[], tools?: LLMTool[]): Promise<ChatResponse> {
    const options: any = {
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens || this.modelDef.maxOutput,
    };

    // Apply model-specific features
    this.applyModelFeatures(options);

    // Add tools if provided
    if (tools && tools.length > 0) {
      options.tools = tools;
    }

    const result = await generateText(options);

    // Convert AI SDK response to ChatResponse
    return {
      content: result.text,
      toolCalls: result.toolCalls?.map((tc: any) => ({
        id: tc.id || '',
        name: tc.toolName,
        arguments: tc.args,
      })),
      finishReason: this.mapFinishReason(result.finishReason),
      usage: {
        inputTokens: (result.usage as any)?.promptTokens || 0,
        outputTokens: (result.usage as any)?.completionTokens || 0,
        totalTokens: result.usage?.totalTokens || 0,
      },
    };
  }

  /**
   * Streaming chat completion
   */
  async *streamChat(messages: Message[], tools?: LLMTool[]): AsyncGenerator<ChatChunk> {
    const options: any = {
      model: this.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: this.config.temperature,
      maxTokens: this.config.maxTokens || this.modelDef.maxOutput,
    };

    // Apply model-specific features
    this.applyModelFeatures(options);

    // Add tools if provided
    if (tools && tools.length > 0) {
      options.tools = tools;
    }

    const result = await streamText(options);

    // Stream chunks
    for await (const chunk of result.textStream) {
      yield {
        content: chunk,
        done: false,
      };
    }

    // Final chunk to signal completion
    yield {
      content: '',
      done: true,
    };
  }

  /**
   * Apply model-specific features (thinking mode, reasoning, etc.)
   */
  private applyModelFeatures(options: any): void {
    if (!this.modelDef.features) return;

    // Anthropic thinking mode
    if (this.modelDef.features.thinking) {
      options.experimental_thinking = this.modelDef.features.thinking;
    }

    // DeepSeek R1 / OpenAI o1 reasoning mode
    if (this.modelDef.features.reasoning) {
      // Reasoning models typically require temperature=1
      options.temperature = 1.0;
    }
  }

  /**
   * Count tokens in text
   */
  countTokens(text: string): number {
    // AI SDK doesn't provide direct token counting yet
    // For now, use rough estimation: ~4 chars per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate cost based on token usage
   */
  calculateCost(inputTokens: number, outputTokens: number): number {
    const { pricing } = this.modelDef;

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;

    return inputCost + outputCost;
  }

  /**
   * Get provider name
   */
  getProviderName(): string {
    return this.providerDef.id;
  }

  /**
   * Get model name
   */
  getModelName(): string {
    return this.modelDef.id;
  }

  /**
   * Get provider metadata
   */
  getProviderInfo(): ProviderDefinition {
    return this.providerDef;
  }

  /**
   * Get model metadata
   */
  getModelInfo(): ModelDefinition {
    return this.modelDef;
  }

  /**
   * Map AI SDK finish reason to our format
   */
  private mapFinishReason(
    sdkReason: string | undefined
  ): 'stop' | 'tool_calls' | 'length' | 'error' {
    switch (sdkReason) {
      case 'stop':
        return 'stop';
      case 'tool-calls':
      case 'tool_calls':
        return 'tool_calls';
      case 'length':
      case 'max_tokens':
        return 'length';
      case 'error':
      case 'content-filter':
        return 'error';
      default:
        return 'stop';
    }
  }
}
