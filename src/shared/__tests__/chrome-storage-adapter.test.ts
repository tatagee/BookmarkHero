import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chromeStorageAdapter } from '../chrome-storage-adapter';

// Mock chrome API
global.chrome = {
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    }
  },
  runtime: {
    lastError: undefined
  }
} as any;

describe('chromeStorageAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.chrome.runtime as any).lastError = undefined;
  });

  describe('getItem', () => {
    it('应该成功获取值', async () => {
      vi.mocked(chrome.storage.local.get).mockImplementationOnce((key, cb) => {
        cb({ [key as string]: 'test-value' });
      });

      const value = await chromeStorageAdapter.getItem('testKey');
      expect(value).toBe('test-value');
      expect(chrome.storage.local.get).toHaveBeenCalledWith('testKey', expect.any(Function));
    });

    it('当发生 lastError 时应该抛出错误', async () => {
      (global.chrome.runtime as any).lastError = { message: 'Storage error' };
      vi.mocked(chrome.storage.local.get).mockImplementationOnce((key, cb) => {
        cb({});
      });

      await expect(chromeStorageAdapter.getItem('testKey')).rejects.toThrow('Storage error');
    });
  });

  describe('setItem', () => {
    it('应该成功设置值', async () => {
      vi.mocked(chrome.storage.local.set).mockImplementationOnce((data, cb) => {
        if (cb) cb();
      });

      await chromeStorageAdapter.setItem('testKey', 'test-value');
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ 'testKey': 'test-value' }, expect.any(Function));
    });

    it('如果内容超过 10MB 应该抛出错误', async () => {
      const longValue = 'a'.repeat(10 * 1024 * 1024 + 1);
      await expect(chromeStorageAdapter.setItem('testKey', longValue)).rejects.toThrow('exceeds 10MB limit');
    });

    it('当发生 lastError 时应该抛出错误', async () => {
      (global.chrome.runtime as any).lastError = { message: 'Write failed' };
      vi.mocked(chrome.storage.local.set).mockImplementationOnce((data, cb) => {
        if (cb) cb();
      });

      await expect(chromeStorageAdapter.setItem('testKey', 'test-value')).rejects.toThrow('Write failed');
    });
  });

  describe('removeItem', () => {
    it('应该成功删除值', async () => {
      vi.mocked(chrome.storage.local.remove).mockImplementationOnce((key, cb) => {
        if (cb) cb();
      });

      await chromeStorageAdapter.removeItem('testKey');
      expect(chrome.storage.local.remove).toHaveBeenCalledWith('testKey', expect.any(Function));
    });

    it('当发生 lastError 时应该抛出错误', async () => {
      (global.chrome.runtime as any).lastError = { message: 'Remove failed' };
      vi.mocked(chrome.storage.local.remove).mockImplementationOnce((key, cb) => {
        if (cb) cb();
      });

      await expect(chromeStorageAdapter.removeItem('testKey')).rejects.toThrow('Remove failed');
    });
  });
});
