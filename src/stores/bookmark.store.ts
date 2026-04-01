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
  /** 上次成功获取的时间戳 */
  lastFetched: number;
  
  /**
   * 触发重新获取最新书签并分析
   */
  refreshBookmarks: (force?: boolean) => Promise<void>;
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  tree: [],
  stats: null,
  isLoading: false,
  error: null,
  lastFetched: 0,
  
  refreshBookmarks: async (force = false) => {
    const state = get();
    // 防抖：如果非强制刷新且距离上次成功获取不到 2 秒，直接复用缓存
    if (!force && state.tree.length > 0 && Date.now() - state.lastFetched < 2000) {
      return;
    }

    set({ isLoading: true, error: null });
    try {
       // 1. 获取树结构
       const tree = await getBookmarkTree();
       // 2. 将树喂给分析器统计出视图需要的大盘数据
       const analyzer = new BookmarkAnalyzer();
       const stats = analyzer.analyze(tree);
       
       set({ tree, stats, isLoading: false, lastFetched: Date.now() });
    } catch (err: unknown) {
       set({ 
         error: err instanceof Error ? err.message : String(err),
         isLoading: false 
       });
    }
  }
}));
