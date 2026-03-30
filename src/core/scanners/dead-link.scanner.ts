import type { IScanner, ScanResult, ScanIssue, ScanProgress, ScanOptions } from './types';
import { flatBookmarks } from '../utils/bookmark-tree';
import { SCAN_CONFIG } from '../../shared/constants';
import type { DeadLinkCheckPayload, DeadLinkResultPayload } from '../../shared/messages';

/**
 * 通过 chrome.runtime 消息将 URL 检测任务委派给 Background Service Worker
 * Background 拥有 host_permissions，可真正发起跨域 fetch
 *
 * @param urls 需要被检测的书签列表
 * @param timeoutMs 每个请求的超时时间
 */
async function checkUrlsViaBackground(
  urls: { bookmarkId: string; url: string }[],
  timeoutMs: number
): Promise<DeadLinkResultPayload> {
  const requestId = `dl-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const payload: DeadLinkCheckPayload = { requestId, urls, timeoutMs };

  return new Promise((resolve, reject) => {
    // 设置整体超时，防止 background 无响应时永久挂起
    const globalTimer = setTimeout(() => {
      reject(new Error('[DeadLinkScanner] Background response timed out.'));
    }, timeoutMs * urls.length + 5000); // 留 5s 的总响应余量

    chrome.runtime.sendMessage({ type: 'deadlink:check', payload }, (response) => {
      clearTimeout(globalTimer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response as DeadLinkResultPayload);
    });
  });
}

export class DeadLinkScanner implements IScanner {
  public id = 'dead-link-scanner';
  public name = '死链体检';
  public description = '逐个检测书签链接是否已失效(404)或服务器已宕机。';

  private isCancelled = false;

  /**
   * 过滤掉不需要/无法检测的链接
   */
  private isIgnoredUrl(url: string, options?: ScanOptions): boolean {
    if (!url) return true;

    // 忽略浏览器内置页面和本地文件
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://')) return true;
    if (url.startsWith('file://')) return true;
    if (url.startsWith('javascript:')) return true;

    if (options?.ignoreDomains) {
      try {
        const hostname = new URL(url).hostname;
        if (options.ignoreDomains.some(d => hostname.includes(d))) return true;
      } catch {
        return true;
      }
    }
    return false;
  }

  async scan(
    nodes: chrome.bookmarks.BookmarkTreeNode[],
    options?: ScanOptions,
    onProgress?: (progress: ScanProgress) => void
  ): Promise<ScanResult> {
    this.isCancelled = false;
    const startTime = Date.now();
    const issues: ScanIssue[] = [];

    // 收集所有需要扫描的书签
    const bookmarks = flatBookmarks(nodes).filter(b => b.url && !this.isIgnoredUrl(b.url, options));
    const total = bookmarks.length;

    if (total === 0) {
      if (onProgress) onProgress({ scannerId: this.id, total: 1, current: 1, message: '没有需要检测的书签' });
      return { scannerId: this.id, issues: [], stats: { totalScanned: 0, issuesFound: 0, duration: Date.now() - startTime } };
    }

    // 分批提交给 Background，每批 BATCH_SIZE 个，避免单次消息体过大
    // 优先使用用户在 settings 里设置的并发参数
    const effectiveConcurrency = options?.maxConcurrency ?? SCAN_CONFIG.MAX_CONCURRENCY;
    const BATCH_SIZE = effectiveConcurrency * 4; // 如: 5 * 4 = 20个一批
    let scannedCount = 0;

    for (let i = 0; i < bookmarks.length; i += BATCH_SIZE) {
      if (this.isCancelled) break;

      const batch = bookmarks.slice(i, i + BATCH_SIZE);
      const batchUrls = batch.map(b => ({ bookmarkId: b.id, url: b.url! }));

      if (onProgress) {
        onProgress({
          scannerId: this.id,
          total,
          current: scannedCount,
          message: `正在发送第 ${Math.floor(i / BATCH_SIZE) + 1} 批 (共 ${Math.ceil(total / BATCH_SIZE)} 批)...`,
        });
      }

      try {
        // 委派给 background 执行真实网络请求
        const result = await checkUrlsViaBackground(batchUrls, SCAN_CONFIG.HEAD_TIMEOUT_MS);

        for (const urlResult of result.results) {
          if (this.isCancelled) break;
          scannedCount++;

          if (!urlResult.alive) {
            // 找到原始书签以获取 title 等信息
            const bm = batch.find(b => b.id === urlResult.bookmarkId);
            let message = '链接失效';
            if (urlResult.error === 'TIMEOUT') message = '访问超时';
            else if (urlResult.statusCode) message = `请求失败 (HTTP ${urlResult.statusCode})`;

            issues.push({
              id: `deadlink-${urlResult.bookmarkId}`,
              bookmarkId: urlResult.bookmarkId,
              bookmarkTitle: bm?.title || '无标题书签',
              bookmarkUrl: urlResult.url,
              severity: 'error',
              message,
              suggestedAction: 'delete',
              data: { statusCode: urlResult.statusCode, error: urlResult.error },
            });
          } else {
            // 链接正常，仅计数
          }

          if (onProgress && scannedCount % 5 === 0) {
            onProgress({
              scannerId: this.id,
              total,
              current: scannedCount,
              message: `已检测 ${scannedCount} / ${total}`,
            });
          }
        }
      } catch (err) {
        console.error('[DeadLinkScanner] Batch check failed, skipping batch:', err);
        // 单批失败不中断整个扫描，记录跳过的数量
        scannedCount += batch.length;
      }
    }

    if (onProgress) {
      onProgress({ scannerId: this.id, total, current: total, message: '死链体检完成！' });
    }

    return {
      scannerId: this.id,
      issues,
      stats: {
        totalScanned: scannedCount,
        issuesFound: issues.length,
        duration: Date.now() - startTime,
      },
    };
  }

  cancel(): void {
    this.isCancelled = true;
  }
}
