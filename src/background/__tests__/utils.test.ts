import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkUrlAlive, escapeHtml } from '../utils';

describe('Background Utils', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  describe('escapeHtml', () => {
    it('应该转义特殊 HTML 字符', () => {
      expect(escapeHtml('<script>alert("test & pass \'x\'")</script>'))
        .toBe('&lt;script&gt;alert(&quot;test &amp; pass &#039;x&#039;&quot;)&lt;/script&gt;');
    });
    
    it('空字符或 undefined 返回空字符串', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(undefined as any)).toBe('');
    });
  });

  describe('checkUrlAlive', () => {
    it('HEAD 请求成功应该返回 alive: true', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });

      const promise = checkUrlAlive('https://example.com', 5000);
      const result = await promise;

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ alive: true, statusCode: 200 });
    });

    it('HEAD 失败但 GET 成功应该 fallback 并返回 true', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 405 }) // HEAD fails
        .mockResolvedValueOnce({ ok: true, status: 200 }); // GET success

      const promise = checkUrlAlive('https://example.com', 5000);
      const result = await promise;

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ alive: true, statusCode: 200 });
    });

    it('HEAD 失败且 GET 失败应该返回 alive: false', async () => {
      global.fetch = vi.fn()
        .mockResolvedValueOnce({ ok: false, status: 405 })
        .mockResolvedValueOnce({ ok: false, status: 404 });

      const promise = checkUrlAlive('https://example.com', 5000);
      const result = await promise;

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ alive: false, statusCode: 404 });
    });

    it('请求超时应该返回 TIMEOUT 错误', async () => {
      // 模拟一个只有 abort 指令才 reject 的 fetch
      global.fetch = vi.fn((input, options: any) => new Promise((resolve, reject) => {
        if (options && options.signal) {
          options.signal.addEventListener('abort', () => {
            const err = new Error('AbortError');
            err.name = 'AbortError';
            reject(err);
          });
        }
      })) as any;

      const promise = checkUrlAlive('https://example.com', 100);
      vi.advanceTimersByTime(200); // Trigger timeout
      const result = await promise;

      expect(result).toEqual({ alive: false, error: 'TIMEOUT' });
    });

    it('fetch 抛出异常应该被捕获并返回', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const result = await checkUrlAlive('https://example.com', 5000);

      expect(result).toEqual({ alive: false, error: 'Network error' });
    });
  });
});
