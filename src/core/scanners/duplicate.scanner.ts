import type { IScanner, ScanResult, ScanIssue, ScanProgress, ScanOptions } from './types';
import { flatBookmarks } from '../utils/bookmark-tree';
import { normalizeUrl } from '../utils/url';

export class DuplicateScanner implements IScanner {
  public id = 'duplicate-scanner';
  public name = '重复书签清理';
  public description = '智能识别内容相同但 URL 有细微差异的重复书签。';
  
  private isCancelled = false;

  async scan(
    nodes: chrome.bookmarks.BookmarkTreeNode[],
    _options?: ScanOptions,
    onProgress?: (progress: ScanProgress) => void
  ): Promise<ScanResult> {
    this.isCancelled = false;
    const startTime = Date.now();
    const issues: ScanIssue[] = [];
    
    // 1. 展平书签树，过滤出有效的网页书签
    const bookmarks = flatBookmarks(nodes);
    let totalScanned = 0;
    
    // 2. 建立 URL 映射字典来查找重复项
    // 键 = 标准化后的 URL, 值 = 拥有该 URL 的书签节点数组
    const urlMap = new Map<string, chrome.bookmarks.BookmarkTreeNode[]>();

    for (let i = 0; i < bookmarks.length; i++) {
      if (this.isCancelled) break;
      
      const bookmark = bookmarks[i];
      if (!bookmark.url) continue; 
      
      totalScanned++;
      
      if (onProgress && i % 100 === 0) {
        onProgress({
          scannerId: this.id,
          total: bookmarks.length,
          current: i,
          message: `正在分析: ${bookmark.title?.substring(0, 20)}...`
        });
      }
      
      // 使用工具函数进行标准化处理
      const normalized = normalizeUrl(bookmark.url);
      
      const existing = urlMap.get(normalized) || [];
      existing.push(bookmark);
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
          const dupe = dupes[j];
          issues.push({
            id: `duplicate-${dupe.id}`,
            bookmarkId: dupe.id,
            bookmarkTitle: dupe.title || '无标题书签',
            bookmarkUrl: dupe.url,
            severity: 'warning',
            message: `发现重复书签 (与 "${dupes[0].title}" 内容一致)`,
            suggestedAction: 'delete',
            data: {
              groupId: duplicateGroupCount,
              normalizedUrl,
              originalId: dupes[0].id // 原版的 ID 供后续合并参考
            }
          });
        }
      }
    }
    
    if (onProgress) {
        onProgress({
            scannerId: this.id,
            total: bookmarks.length,
            current: bookmarks.length,
            message: '重复项扫描完成！'
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
