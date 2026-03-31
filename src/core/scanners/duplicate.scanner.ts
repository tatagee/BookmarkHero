import type { IScanner, ScanResult, ScanIssue, ScanProgress, ScanOptions } from './types';
import { traverseBookmarkTree } from '../utils/bookmark-tree';
import { normalizeUrl } from '../utils/url';
import { getT } from '../../i18n';

export class DuplicateScanner implements IScanner {
  public id = 'duplicate-scanner';
  public name = 'scanner.duplicate.name';
  public description = 'scanner.duplicate.desc';
  
  private isCancelled = false;

  async scan(
    nodes: chrome.bookmarks.BookmarkTreeNode[],
    _options?: ScanOptions,
    onProgress?: (progress: ScanProgress) => void
  ): Promise<ScanResult> {
    this.isCancelled = false;
    const startTime = Date.now();
    const issues: ScanIssue[] = [];
    const t = getT();
    
    // 1. 遍历书签树，保留所有的路径信息以备后续展示
    const bookmarksWithPaths: { node: chrome.bookmarks.BookmarkTreeNode, path: string }[] = [];
    
    await traverseBookmarkTree(nodes, {
      onBookmark: (node, path) => {
        if (node.url) {
          bookmarksWithPaths.push({
             node, 
             // 把路径数组合并成易读的字符串如: 文件夹 A / 文件夹 B
             path: path.length > 0 ? path.join(' / ') : '书签栏根目录' 
          });
        }
      }
    });
    
    let totalScanned = 0;
    
    // 2. 建立 URL 映射字典来查找重复项
    // 键 = 标准化后的 URL, 值 = 拥有该 URL 的书签及路径对象集合
    const urlMap = new Map<string, { node: chrome.bookmarks.BookmarkTreeNode, path: string }[]>();

    for (let i = 0; i < bookmarksWithPaths.length; i++) {
      if (this.isCancelled) break;
      
      const item = bookmarksWithPaths[i];
      const bookmark = item.node;
      
      totalScanned++;
      
      if (onProgress && i % 100 === 0) {
        onProgress({
          scannerId: this.id,
          total: bookmarksWithPaths.length,
          current: i,
          message: t('scanner.msg.dupe.check', { title: bookmark.title?.substring(0, 20) || '' })
        });
      }
      
      // 使用工具函数进行标准化处理
      const normalized = normalizeUrl(bookmark.url!);
      
      const existing = urlMap.get(normalized) || [];
      existing.push(item);
      urlMap.set(normalized, existing);
    }
    
    // 3. 筛选出存在重复项的书签组 (同组数 > 1)
    let duplicateGroupCount = 0;
    for (const [normalizedUrl, dupes] of urlMap.entries()) {
      if (this.isCancelled) break;
      
      if (dupes.length > 1) {
        duplicateGroupCount++;
        // 将第一个视为"原版"，其余视为重复项
        for (let j = 1; j < dupes.length; j++) {
          const dupeItem = dupes[j];
          const dupe = dupeItem.node;
          const originalItem = dupes[0];
          
          issues.push({
            id: `duplicate-${dupe.id}`,
            bookmarkId: dupe.id,
            bookmarkTitle: dupe.title || '无标题书签',
            bookmarkUrl: dupe.url,
            severity: 'warning',
            message: t('scanner.issue.duplicate', { title: originalItem.node.title || '' }),
            suggestedAction: 'delete',
            data: {
              groupId: duplicateGroupCount,
              normalizedUrl,
              originalId: originalItem.node.id, // 原版的 ID 供后续合并参考
              folderPath: dupeItem.path,       // 自己的路径
              originalFolderPath: originalItem.path // 原版的路径，辅助决策
            }
          });
        }
      }
    }
    
    if (onProgress) {
        onProgress({
            scannerId: this.id,
            total: bookmarksWithPaths.length,
            current: bookmarksWithPaths.length,
            message: t('scanner.msg.dupe.done')
        });
    }

    return {
      scannerId: this.id,
      issues,
      stats: {
        totalScanned,
        issuesFound: issues.length,
        duration: Date.now() - startTime
      }
    };
  }

  cancel(): void {
    this.isCancelled = true;
  }
}
