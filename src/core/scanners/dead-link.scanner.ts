import type { IScanner, ScanResult, ScanIssue, ScanProgress, ScanOptions } from './types';
import { traverseBookmarkTree } from '../utils/bookmark-tree';
import { ConcurrencyQueue, chunkArray } from '../utils/concurrency';
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

    // 按批次分组：每批 BATCH_SIZE 个 URL 一起发给 Background 并发检测
    // 这样大幅减少 IPC 通信次数，加速整体检测
    const BATCH_SIZE = 10;
    const batches = chunkArray(bookmarksWithPaths, BATCH_SIZE);
    const effectiveConcurrency = options?.maxConcurrency ?? SCAN_CONFIG.MAX_CONCURRENCY;
    const queue = new ConcurrencyQueue(effectiveConcurrency);
    let scannedCount = 0;

    // 构建 node id → folderPath 的快速查找表
    const folderPathMap = new Map<string, string>();
    const nodeMap = new Map<string, chrome.bookmarks.BookmarkTreeNode>();
    for (const item of bookmarksWithPaths) {
      folderPathMap.set(item.node.id, item.folderPath);
      nodeMap.set(item.node.id, item.node);
    }

    // 为每个批次创建一个入队的 Promise
    const checkPromises = batches.map((batch) => {
      return queue.run(async () => {
        if (this.isCancelled) return;

        try {
          const urls = batch.map(b => ({ bookmarkId: b.node.id, url: b.node.url! }));
          const result = await checkUrlsViaBackground(urls, SCAN_CONFIG.HEAD_TIMEOUT_MS);

          if (this.isCancelled) return;

          // 遍历该批次的所有结果
          for (const urlResult of result.results) {
            scannedCount++;

            if (!urlResult.alive) {
              let message = '链接失效';
              if (urlResult.error === 'TIMEOUT') message = '访问超时';
              else if (urlResult.statusCode) message = `请求失败 (HTTP ${urlResult.statusCode})`;

              const bookmark = nodeMap.get(urlResult.bookmarkId);
              const folderPath = folderPathMap.get(urlResult.bookmarkId) ?? '';

              issues.push({
                id: `deadlink-${urlResult.bookmarkId}`,
                bookmarkId: urlResult.bookmarkId,
                bookmarkTitle: bookmark?.title || '无标题书签',
                bookmarkUrl: urlResult.url,
                severity: 'error',
                message,
                suggestedAction: 'delete',
                data: { statusCode: urlResult.statusCode, error: urlResult.error, folderPath },
              });
            }
          }
        } catch (err) {
          if (this.isCancelled) return;
          console.error('[DeadLinkScanner] Batch check failed:', err);
          scannedCount += batch.length; // 失败也算扫过，防止进度卡死
        }

        // 每完成一个批次更新一次进度
        if (onProgress) {
          onProgress({
            scannerId: this.id,
            total,
            current: Math.min(scannedCount, total),
            message: `已检测 ${Math.min(scannedCount, total)} / ${total}`,
          });
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
