import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeadLinkScanner } from '@/core/scanners/dead-link.scanner';
import { buildBookmarkTree, createBookmark, createFolder } from '@/tests/helpers/mock-bookmarks';

describe('DeadLinkScanner', () => {
  let scanner: DeadLinkScanner;

  beforeEach(() => {
    scanner = new DeadLinkScanner();
    // 默认模拟: 所有 URL 都存活
     
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      ((...args: unknown[]) => {
        const message = args[0] as { payload: { urls: { bookmarkId: string; url: string }[] } };
        const callback = args[args.length - 1] as (response: unknown) => void;
        const results = message.payload.urls.map((u: { bookmarkId: string; url: string }) => ({
          bookmarkId: u.bookmarkId,
          url: u.url,
          alive: true,
          statusCode: 200,
        }));
        if (typeof callback === 'function') callback({ requestId: 'test', results });
      }) as unknown as typeof chrome.runtime.sendMessage
    );
  });

  it('所有链接存活时不应产生 issue', async () => {
    const tree = buildBookmarkTree([
      createBookmark({ id: 'b1', url: 'https://google.com' }),
      createBookmark({ id: 'b2', url: 'https://github.com' }),
    ]);

    const result = await scanner.scan(tree);
    expect(result.issues).toHaveLength(0);
    expect(result.stats.totalScanned).toBe(2);
  });

  it('死链应该被标记为 error issue', async () => {
     
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      ((...args: unknown[]) => {
        const message = args[0] as { payload: { urls: { bookmarkId: string; url: string }[] } };
        const callback = args[args.length - 1] as (response: unknown) => void;
        const results = message.payload.urls.map((u: { bookmarkId: string; url: string }) => ({
          bookmarkId: u.bookmarkId,
          url: u.url,
          alive: false,
          statusCode: 404,
        }));
        if (typeof callback === 'function') callback({ requestId: 'test', results });
      }) as unknown as typeof chrome.runtime.sendMessage
    );

    const tree = buildBookmarkTree([
      createBookmark({ id: 'dead', title: '已死页面', url: 'https://dead-site.com' }),
    ]);

    const result = await scanner.scan(tree);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe('error');
    expect(result.issues[0].bookmarkId).toBe('dead');
    expect(result.issues[0].message).toContain('HTTP 404');
  });

  it('应该忽略 chrome:// 和 file:// 等内部协议', async () => {
    const tree = buildBookmarkTree([
      createBookmark({ id: 'c1', url: 'chrome://settings' }),
      createBookmark({ id: 'c2', url: 'chrome-extension://abc/page.html' }),
      createBookmark({ id: 'c3', url: 'file:///local/path.html' }),
      createBookmark({ id: 'c4', url: 'javascript:void(0)' }),
    ]);

    const result = await scanner.scan(tree);
    expect(result.stats.totalScanned).toBe(0);
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('应该支持 ignoreDomains 配置', async () => {
    const tree = buildBookmarkTree([
      createBookmark({ id: 'b1', url: 'https://localhost:3000/app' }),
      createBookmark({ id: 'b2', url: 'https://127.0.0.1:8080/api' }),
      createBookmark({ id: 'b3', url: 'https://example.com' }),
    ]);

    const result = await scanner.scan(tree, {
      ignoreDomains: ['localhost', '127.0.0.1'],
    });

    expect(result.stats.totalScanned).toBe(1);
  });

  it('超时的链接应该被报告为 TIMEOUT', async () => {
     
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(
      ((...args: unknown[]) => {
        const message = args[0] as { payload: { urls: { bookmarkId: string; url: string }[] } };
        const callback = args[args.length - 1] as (response: unknown) => void;
        const results = message.payload.urls.map((u: { bookmarkId: string; url: string }) => ({
          bookmarkId: u.bookmarkId,
          url: u.url,
          alive: false,
          error: 'TIMEOUT',
        }));
        if (typeof callback === 'function') callback({ requestId: 'test', results });
      }) as unknown as typeof chrome.runtime.sendMessage
    );

    const tree = buildBookmarkTree([
      createBookmark({ id: 'slow', url: 'https://slow-site.com' }),
    ]);

    const result = await scanner.scan(tree);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toContain('超时');
  });

  it('没有可检测的书签时应正常返回空结果', async () => {
    const tree = buildBookmarkTree([createFolder({ id: 'f1' })]);
    const result = await scanner.scan(tree);
    expect(result.issues).toHaveLength(0);
    expect(result.stats.totalScanned).toBe(0);
  });
});
