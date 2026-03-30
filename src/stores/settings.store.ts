import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { STORAGE_KEYS } from '../shared/constants';
import { chromeStorageAdapter } from '../shared/chrome-storage-adapter';

export interface SettingsState {
  /** 允许并发的最大数 */
  maxConcurrency: number;
  /** 全局域名豁免名单（扫瞄时遇到这些域名会直接跳过） */
  ignoreDomains: string[];

  actions: {
    addIgnoreDomain: (domain: string) => void;
    removeIgnoreDomain: (domain: string) => void;
    setMaxConcurrency: (count: number) => void;
  };
}

/**
 * 用户设置存储
 * 使用 chrome.storage.local 代替 localStorage，确保 SidePanel / Options / Popup
 * 三个独立页面共享同一份设置数据。
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      maxConcurrency: 5,
      ignoreDomains: ['localhost', '127.0.0.1'], // 移除 github.com, 它的死链应该被检测

      actions: {
        addIgnoreDomain: (domain) =>
          set((state) => ({
            ignoreDomains: [...new Set([...state.ignoreDomains, domain.toLowerCase().trim()])],
          })),
        removeIgnoreDomain: (domain) =>
          set((state) => ({
            ignoreDomains: state.ignoreDomains.filter((d) => d !== domain),
          })),
        setMaxConcurrency: (count) =>
          set({ maxConcurrency: Math.max(1, Math.min(20, count)) }), // 限制在 1~20 之间
      },
    }),
    {
      name: STORAGE_KEYS.SETTINGS,
      // 只持久化数据，actions 中的函数不参与序列化
      partialize: (state) =>
        Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'actions')),
      // ✅ 使用 chrome.storage.local 替代 localStorage，解决多页面不同步问题
      storage: createJSONStorage(() => chromeStorageAdapter),
    }
  )
);

/** 对外释放 actions，方便组件调用而不订阅无关状态变化 */
export const useSettingsActions = () => useSettingsStore((state) => state.actions);
