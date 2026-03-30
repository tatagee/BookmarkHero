import type { IScanner, ScanResult, ScanIssue, ScanProgress, ScanOptions } from './types';
import { traverseBookmarkTree } from '../utils/bookmark-tree';
import { ConcurrencyQueue } from '../utils/concurrency';
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

    // 用带路径的遍历收集所有书签，保留文件夹路径供 UI 展示
    const bookmarksWithPaths: { node: chrome.bookmarks.BookmarkTreeNode; folderPath: string }[] = [];
    await traverseBookmarkTree(nodes, {
      onBookmark: (node, path) => {
        if (node.url && !this.isIgnoredUrl(node.url, options)) {
          bookmarksWithPaths.push({
            node,
            folderPath: path.length > 0 ? path.join(' / ') : '书签栏根目录',
          });
        }
      },
    });

    const total = bookmarksWithPaths.length;

    if (total === 0) {
      if (onProgress) onProgress({ scannerId: this.id, total: 1, current: 1, message: '没有需要检测的书签' });
      return { scannerId: this.id, issues: [], stats: { totalScanned: 0, issuesFound: 0, duration: Date.now() - startTime } };
    }

    // 弃用之前的按批次分块 (BATCH_SIZE) 处理
    // 改用 ConcurrencyQueue 实现精确的滑动窗口并发调度，避免慢链接阻塞整批
    const effectiveConcurrency = options?.maxConcurrency ?? SCAN_CONFIG.MAX_CONCURRENCY;
    const queue = new ConcurrencyQueue(effectiveConcurrency);
    let scannedCount = 0;

    // 为每个需要检测的书签创建一个入队的 Promise
    const checkPromises = bookmarksWithPaths.map(({ node: bookmark, folderPath }) => {
      return queue.run(async () => {
        if (this.isCancelled) return;
        
        try {
          // 只把当前的单个 URL 交给 Background 测活
          const result = await checkUrlsViaBackground(
            [{ bookmarkId: bookmark.id, url: bookmark.url! }], 
            SCAN_CONFIG.HEAD_TIMEOUT_MS
          );
          
          if (this.isCancelled) return;
          
          scannedCount++;
          const urlResult = result.results[0]; // 只有一个结果

          if (!urlResult.alive) {
            let message = '链接失效';
            if (urlResult.error === 'TIMEOUT') message = '访问超时';
            else if (urlResult.statusCode) message = `请求失败 (HTTP ${urlResult.statusCode})`;

            issues.push({
              id: `deadlink-${urlResult.bookmarkId}`,
              bookmarkId: urlResult.bookmarkId,
              bookmarkTitle: bookmark.title || '无标题书签',
              bookmarkUrl: urlResult.url,
              severity: 'error',
              message,
              suggestedAction: 'delete',
              // 新增 folderPath，方便用户定位书签位置
              data: { statusCode: urlResult.statusCode, error: urlResult.error, folderPath },
            });
          }

          // 发送 UI 刷新（每检测够设定数量刷新一次界面避免过度重绘）
          if (onProgress && scannedCount % 5 === 0) {
            onProgress({
              scannerId: this.id,
              total,
              current: scannedCount,
              message: `已检测 ${scannedCount} / ${total}`,
            });
          }
        } catch (err) {
          if (this.isCancelled) return;
          console.error('[DeadLinkScanner] Single check failed:', err);
          scannedCount++; // 即使失败内部代码错误也按扫过处理，免得长久卡死进度条
        }
      });
    });

    // 等待滑动窗口中的所有任务跑完
    await Promise.all(checkPromises);

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
