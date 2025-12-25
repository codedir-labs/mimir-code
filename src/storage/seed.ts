/**
 * Database seed data for initial setup
 */

import { NewPricing } from './schema.js';

/**
 * Default pricing data for LLM providers (as of January 2025)
 */
export const defaultPricing: NewPricing[] = [
  // DeepSeek
  {
    provider: 'deepseek',
    model: 'deepseek-chat',
    inputPricePer1M: 0.14,
    outputPricePer1M: 0.28,
    notes: 'DeepSeek-V3 pricing',
  },
  {
    provider: 'deepseek',
    model: 'deepseek-coder',
    inputPricePer1M: 0.14,
    outputPricePer1M: 0.28,
    notes: 'DeepSeek Coder pricing',
  },

  // Anthropic Claude
  {
    provider: 'anthropic',
    model: 'claude-3-5-sonnet-20241022',
    inputPricePer1M: 3.0,
    outputPricePer1M: 15.0,
    notes: 'Claude 3.5 Sonnet',
  },
  {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022',
    inputPricePer1M: 0.8,
    outputPricePer1M: 4.0,
    notes: 'Claude 3.5 Haiku',
  },
  {
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
    inputPricePer1M: 15.0,
    outputPricePer1M: 75.0,
    notes: 'Claude 3 Opus',
  },

  // OpenAI
  {
    provider: 'openai',
    model: 'gpt-4-turbo',
    inputPricePer1M: 10.0,
    outputPricePer1M: 30.0,
    notes: 'GPT-4 Turbo',
  },
  {
    provider: 'openai',
    model: 'gpt-4o',
    inputPricePer1M: 2.5,
    outputPricePer1M: 10.0,
    notes: 'GPT-4o',
  },
  {
    provider: 'openai',
    model: 'gpt-4o-mini',
    inputPricePer1M: 0.15,
    outputPricePer1M: 0.6,
    notes: 'GPT-4o Mini',
  },
  {
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    inputPricePer1M: 0.5,
    outputPricePer1M: 1.5,
    notes: 'GPT-3.5 Turbo',
  },

  // Google Gemini
  {
    provider: 'google',
    model: 'gemini-2.0-flash-exp',
    inputPricePer1M: 0.0,
    outputPricePer1M: 0.0,
    notes: 'Free during preview',
  },
  {
    provider: 'google',
    model: 'gemini-1.5-pro',
    inputPricePer1M: 1.25,
    outputPricePer1M: 5.0,
    notes: 'Gemini 1.5 Pro',
  },
  {
    provider: 'google',
    model: 'gemini-1.5-flash',
    inputPricePer1M: 0.075,
    outputPricePer1M: 0.3,
    notes: 'Gemini 1.5 Flash',
  },

  // Qwen
  {
    provider: 'qwen',
    model: 'qwen-max',
    inputPricePer1M: 0.4,
    outputPricePer1M: 1.2,
    notes: 'Qwen Max estimated pricing',
  },
  {
    provider: 'qwen',
    model: 'qwen-plus',
    inputPricePer1M: 0.2,
    outputPricePer1M: 0.6,
    notes: 'Qwen Plus estimated pricing',
  },

  // Ollama (local models)
  {
    provider: 'ollama',
    model: 'llama3',
    inputPricePer1M: 0.0,
    outputPricePer1M: 0.0,
    notes: 'Local model - no API costs',
  },
  {
    provider: 'ollama',
    model: 'mistral',
    inputPricePer1M: 0.0,
    outputPricePer1M: 0.0,
    notes: 'Local model - no API costs',
  },
  {
    provider: 'ollama',
    model: 'codellama',
    inputPricePer1M: 0.0,
    outputPricePer1M: 0.0,
    notes: 'Local model - no API costs',
  },
];
