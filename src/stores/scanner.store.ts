import { create } from 'zustand';
import { getAllScanners } from '../core/scanners';
import type { IScanner, ScanResult, ScanProgress, ScanOptions } from '../core/scanners';
import { getT } from '../i18n';

export interface ScannerState {
  /** 注册的全部体检项目(扫描器)列表 */
  scanners: IScanner[];
  /** 当前正在忙碌的扫瞄器ID, null 表示当前处于空闲阶段 */
  activeScannerId: string | null;
  /** 是否有扫瞄器正在执行 */
  isScanning: boolean;
  /** 即时的扫瞄进度反馈（从扫描器的 onProgress 抛出） */
  progress: ScanProgress | null;
  /** 各个扫瞄器的执行结果，以 ScannerId 作为 Key 进行缓存 */
  results: Record<string, ScanResult>;
  
  /**
   * 拉起指定的体检扫描器
   */
  startScan: (
      scannerId: string, 
      bookmarks: chrome.bookmarks.BookmarkTreeNode[], 
      options?: ScanOptions
  ) => Promise<void>;
  
  /**
   * 立刻掐断运行中的扫瞄器
   */
  cancelScan: () => void;
  
  /**
   * 清除某个扫瞄器缓存在视图上的执行结果
   */
  clearResults: (scannerId: string) => void;
  
  /**
   * 从某个扫描器的结果中移除单条 issue（用户手动删除书签后调用）
   */
  removeIssue: (scannerId: string, issueId: string) => void;
  
  /**
   * 批量移除多条 issue（一键清理后调用，只触发一次 state 更新）
   */
  batchRemoveIssues: (scannerId: string, issueIds: string[]) => void;
}

export const useScannerStore = create<ScannerState>((set, get) => ({
  scanners: getAllScanners(),
  activeScannerId: null,
  isScanning: false,
  progress: null,
  results: {},
  
  startScan: async (scannerId, bookmarks, options) => {
    const state = get();
    if (state.isScanning) {
      console.warn('[ScannerStore] Blocked: A scan is already in progress');
      return;
    }
    
    // 从已挂载的扫描器注册表中找寻
    const scanner = state.scanners.find(s => s.id === scannerId);
    if (!scanner) {
      console.error(`[ScannerStore] Expected scanner not found: ${scannerId}`);
      return;
    }
    
    // 进入占位/准备状态
    const t = getT();
    set({
      isScanning: true,
      activeScannerId: scannerId,
      progress: { scannerId, total: 100, current: 0, message: t('store.scanner.init') }
    });
    
    try {
      // 执行真实的扫瞄底层逻辑
      const result = await scanner.scan(bookmarks, options, (progress) => {
        // 更新界面的实时进度条反馈
        set({ progress });
      });
      
      // 完成并缓存结果
      set((state) => ({
        isScanning: false,
        activeScannerId: null,
        progress: null,
        results: {
          ...state.results,
          [scannerId]: result
        }
      }));
    } catch (err) {
      console.error(`[ScannerStore] Crushed during scan [${scannerId}]:`, err);
      // 捕获异常，将状态置回复位安全区
      set({ isScanning: false, activeScannerId: null, progress: null });
    }
  },
  
  cancelScan: () => {
    const state = get();
    // 只有在忙碌状态下才能掐断
    if (state.isScanning && state.activeScannerId) {
       const scanner = state.scanners.find(s => s.id === state.activeScannerId);
       if (scanner) {
         scanner.cancel();
       }
       // 响应用户，立刻断开界面表现
       set({ isScanning: false, activeScannerId: null, progress: null });
    }
  },
  
  clearResults: (scannerId) => {
    set((state) => {
      const newResults = { ...state.results };
      delete newResults[scannerId];
      return { results: newResults };
    });
  },
  
  removeIssue: (scannerId, issueId) => {
    set((state) => {
      const result = state.results[scannerId];
      if (!result) return state;
      
      const newIssues = result.issues.filter(i => i.id !== issueId);
      return {
        results: {
          ...state.results,
          [scannerId]: {
            ...result,
            issues: newIssues,
            stats: {
              ...result.stats,
              issuesFound: newIssues.length,
            }
          }
        }
      };
    });
  },
  
  batchRemoveIssues: (scannerId, issueIds) => {
    set((state) => {
      const result = state.results[scannerId];
      if (!result) return state;
      
      const idsSet = new Set(issueIds);
      const newIssues = result.issues.filter(i => !idsSet.has(i.id));
      return {
        results: {
          ...state.results,
          [scannerId]: {
            ...result,
            issues: newIssues,
            stats: {
              ...result.stats,
              issuesFound: newIssues.length,
            }
          }
        }
      };
    });
  }
}));
