import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiCloudProvider } from '../gemini-cloud.provider';
import { useSettingsStore } from '../../../stores/settings.store';

// Mock zustand store
vi.mock('../../../stores/settings.store', () => ({
  useSettingsStore: {
    getState: vi.fn(),
  },
}));

// Mock google generative ai
vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: vi.fn(),
      }),
    })),
  };
});

describe('GeminiCloudProvider', () => {
  let provider: GeminiCloudProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GeminiCloudProvider();
    vi.mocked(useSettingsStore.getState).mockReturnValue({
      geminiApiKey: 'test-key',
      geminiModel: 'test-model',
      categoryLanguage: 'en',
    } as any);
  });

  describe('isAvailable', () => {
    it('如果没有配置 API Key 应该返回 false', async () => {
      vi.mocked(useSettingsStore.getState).mockReturnValue({ geminiApiKey: '' } as any);
      expect(await provider.isAvailable()).toBe(false);
    });

    it('API 调用出错时应该脱敏错误日志并返回 false', async () => {
      // Mock generateContent to throw
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const generateContentMock = vi.fn().mockRejectedValue(new Error('Sensitive API_KEY AIza12345 exposed'));
      vi.mocked(GoogleGenerativeAI).mockImplementationOnce(function() {
        return { getGenerativeModel: () => ({ generateContent: generateContentMock }) };
      } as any);
      
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await provider.isAvailable();
      
      expect(result).toBe(false);
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[GeminiCloudProvider] isAvailable test failed:',
        expect.stringContaining('[REDACTED]')
      );
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        '[GeminiCloudProvider] isAvailable test failed:',
        expect.stringContaining('AIza12345')
      );
    });
  });

  describe('classify', () => {
    const mockBookmark = { title: 'Test', url: 'https://test.com', currentPath: 'Root' };
    const mockFolders = [{ id: '1', path: 'Category/Test' }];

    it('如果没有配置 API Key 应该抛出错误', async () => {
      vi.mocked(useSettingsStore.getState).mockReturnValue({ geminiApiKey: '' } as any);
      await expect(provider.classify(mockBookmark, mockFolders)).rejects.toThrow('Gemini API Key is not configured');
    });

    it('如果 API 返回身份验证错误，应抛出友好提示', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const generateContentMock = vi.fn().mockRejectedValue(new Error('API_KEY invalid'));
      vi.mocked(GoogleGenerativeAI).mockImplementationOnce(function() {
        return { getGenerativeModel: () => ({ generateContent: generateContentMock }) };
      } as any);
      
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(provider.classify(mockBookmark, mockFolders)).rejects.toThrow('API Key 验证失败');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[GeminiCloudProvider] Authentication failed');
    });

    it('如果 API 返回其他错误，应该脱敏日志并抛出', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const generateContentMock = vi.fn().mockRejectedValue(new Error('Some error AIza123456'));
      vi.mocked(GoogleGenerativeAI).mockImplementationOnce(function() {
        return { getGenerativeModel: () => ({ generateContent: generateContentMock }) };
      } as any);
      
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(provider.classify(mockBookmark, mockFolders)).rejects.toThrow(/\[REDACTED\]/);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[GeminiCloudProvider] Classify error:',
        expect.stringContaining('[REDACTED]')
      );
    });

    it('应该正确验证返回的 JSON 解析', async () => {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const mockResult = {
        action: 'move',
        suggestedFolderPath: 'Category/Test',
        confidence: 0.9,
      };
      
      const generateContentMock = vi.fn().mockResolvedValue({
        response: { text: () => JSON.stringify(mockResult) }
      });
      vi.mocked(GoogleGenerativeAI).mockImplementationOnce(function() {
        return { getGenerativeModel: () => ({ generateContent: generateContentMock }) };
      } as any);
      
      const result = await provider.classify(mockBookmark, mockFolders);
      expect(result.action).toBe('move');
      expect(result.suggestedFolderId).toBe('1');
    });
  });
});
