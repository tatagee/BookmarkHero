import { getTreeDepth } from '../utils/bookmark-tree';

export interface BookmarkStats {
  totalBookmarks: number;
  totalFolders: number;
  maxDepth: number;
  topDomains: { domain: string; count: number }[];
  recentlyAdded: number; // 过去30天新增
}

export class BookmarkAnalyzer {
  public analyze(nodes: chrome.bookmarks.BookmarkTreeNode[]): BookmarkStats {
    let totalBookmarks = 0;
    let totalFolders = 0;
    const domains = new Map<string, number>();
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    let recentlyAddedCount = 0;

    const traverse = (treeList: chrome.bookmarks.BookmarkTreeNode[]) => {
      for (const node of treeList) {
        if (node.url) {
          totalBookmarks++;
          if (node.dateAdded && (now - node.dateAdded) <= thirtyDaysMs) {
            recentlyAddedCount++;
          }
          
          try {
            // 只取顶级域名或基础主机名进行统计
            const url = new URL(node.url);
            const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
            if (hostname) {
              domains.set(hostname, (domains.get(hostname) || 0) + 1);
            }
          } catch {
            // 忽略无效或无域名 URL，如 chrome://
          }
        } else if (node.id !== '0') { // 忽略根节点
          totalFolders++;
        }

        if (node.children) {
          traverse(node.children);
        }
      }
    };

    traverse(nodes);

    // 排序域名，取前 10 个
    const topDomains = Array.from(domains.entries())
      .sort((a, b) => b[1] - a[1]) // 按数量降序
      .slice(0, 10)
      .map(([domain, count]) => ({ domain, count }));

    return {
      totalBookmarks,
      totalFolders,
      maxDepth: getTreeDepth(nodes),
      topDomains,
      recentlyAdded: recentlyAddedCount
    };
  }
}
