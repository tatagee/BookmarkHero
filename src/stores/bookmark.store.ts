import { create } from 'zustand';
import { getBookmarkTree } from '../shared/chrome-api';
import { BookmarkAnalyzer } from '../core/analyzers/stats.analyzer';
import type { BookmarkStats } from '../core/analyzers/stats.analyzer';

export interface BookmarkState {
  /** 完整的书签节点树 */
  tree: chrome.bookmarks.BookmarkTreeNode[];
  /** 分析后的汇总数据（总量、域名分布等） */
  stats: BookmarkStats | null;
  /** 是否正在从 Chrome SDK 抓取数据 */
  isLoading: boolean;
  /** 抓取错误 */
  error: string | null;
  
  /**
   * 触发重新获取最新书签并分析
   */
  refreshBookmarks: () => Promise<void>;
}

export const useBookmarkStore = create<BookmarkState>((set) => ({
  tree: [],
  stats: null,
  isLoading: false,
  error: null,
  
  refreshBookmarks: async () => {
    set({ isLoading: true, error: null });
    try {
       // 1. 获取树结构
       const tree = await getBookmarkTree();
       // 2. 将树喂给分析器统计出视图需要的大盘数据
       const analyzer = new BookmarkAnalyzer();
       const stats = analyzer.analyze(tree);
       
       set({ tree, stats, isLoading: false });
    } catch (err: unknown) {
       set({ 
         error: err instanceof Error ? err.message : String(err),
         isLoading: false 
       });
    }
  }
}));
