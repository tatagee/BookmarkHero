import type { IAIProvider } from './types';
import { GeminiCloudProvider } from './gemini-cloud.provider';
import { OllamaProvider } from './ollama.provider';

export * from './types';
export * from './gemini-cloud.provider';
export * from './ollama.provider';

export type AIProviderId = 'gemini-cloud' | 'ollama';

/**
 * AI Provider 工厂
 */
export class AIProviderFactory {
  static createProvider(id: AIProviderId): IAIProvider {
    switch (id) {
      case 'gemini-cloud':
        return new GeminiCloudProvider();
      case 'ollama':
        return new OllamaProvider();
      default:
        throw new Error(`Unknown AI Provider: ${id}`);
    }
  }

  static getAvailableProviders(): { id: AIProviderId; name: string }[] {
    return [
      { id: 'gemini-cloud', name: 'Gemini API (Cloud)' },
      { id: 'ollama', name: 'Ollama (Local)' },
    ];
  }
}
