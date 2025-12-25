/**
 * Factory for creating LLM provider instances
 */

import { ILLMProvider } from './ILLMProvider.js';
import { LLMConfig } from '../types/index.js';
import { DeepSeekProvider } from './DeepSeekProvider.js';
import { AnthropicProvider } from './AnthropicProvider.js';

export class ProviderFactory {
  static create(config: LLMConfig): ILLMProvider {
    switch (config.provider.toLowerCase()) {
      case 'deepseek':
        return new DeepSeekProvider(config);
      case 'anthropic':
        return new AnthropicProvider(config);
      case 'openai':
        throw new Error(
          'OpenAI provider coming soon - see roadmap Phase 3. ' +
            'In the meantime, you can use DeepSeek which is OpenAI-compatible.'
        );
      case 'google':
      case 'gemini':
        throw new Error('Google/Gemini provider coming soon - see roadmap Phase 3.');
      case 'qwen':
        throw new Error(
          'Qwen provider coming soon - see roadmap Phase 3. ' +
            'In the meantime, you can use DeepSeek which is similar.'
        );
      case 'ollama':
        throw new Error('Ollama provider coming soon - see roadmap Phase 3.');
      default:
        throw new Error(`Unsupported provider: ${config.provider}`);
    }
  }
}
