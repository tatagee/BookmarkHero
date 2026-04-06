import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { STORAGE_KEYS } from '../shared/constants';
import { chromeStorageAdapter } from '../shared/chrome-storage-adapter';

export interface SettingsState {
  /** 允许并发的最大数 */
  maxConcurrency: number;
  /** 界面的展示语言 (目前只是开关状态) */
  uiLanguage: 'zh' | 'en';
  /** AI 分类建议的最大文件夹层数（1=单层扁平, 2=允许二级子目录） */
  maxCategoryDepth: 1 | 2;
  /** 控制书签文件夹的最大数量，最低10，最高50 */
  maxCategoryCount: number;
  /** 深度整理时，是否保留用户已有的书签文件夹结构 */
  preserveExistingFolders: boolean;
  /** AI 建议分类文件夹的命名语言 */
  categoryLanguage: 'zh' | 'en';
  /** 全局域名豁免名单（扫瞄时遇到这些域名会直接跳过） */
  ignoreDomains: string[];

  // --- AI 相关设置 ---
  activeAiProvider: 'gemini-cloud' | 'ollama';
  geminiApiKey: string;
  geminiModel: string;
  ollamaUrl: string;
  ollamaModel: string;

  actions: {
    addIgnoreDomain: (domain: string) => void;
    removeIgnoreDomain: (domain: string) => void;
    setMaxConcurrency: (count: number) => void;
    setUiLanguage: (lang: 'zh' | 'en') => void;
    setCategoryLanguage: (lang: 'zh' | 'en') => void;
    setMaxCategoryDepth: (depth: 1 | 2) => void;
    setMaxCategoryCount: (count: number) => void;
    setPreserveExistingFolders: (val: boolean) => void;
    
    // UI AI
    setActiveAiProvider: (providerId: 'gemini-cloud' | 'ollama') => void;
    setGeminiApiKey: (key: string) => void;
    setGeminiModel: (model: string) => void;
    setOllamaUrl: (url: string) => void;
    setOllamaModel: (model: string) => void;
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
      maxConcurrency: 10,
      maxCategoryDepth: 2,
      maxCategoryCount: 30, // 默认最大文件夹数为 30
      preserveExistingFolders: true, // 默认保留用户现有文件夹结构
      uiLanguage: 'zh',
      categoryLanguage: 'zh',
      ignoreDomains: ['localhost', '127.0.0.1'], // 移除 github.com, 它的死链应该被检测

      // 默认 AI 选项
      activeAiProvider: 'gemini-cloud',
      geminiApiKey: '',
      geminiModel: 'gemini-2.5-flash-lite',
      ollamaUrl: 'http://localhost:11434',
      ollamaModel: 'llama3',

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
          set({ maxConcurrency: Math.max(1, Math.min(30, count)) }), // 限制在 1~30 之间
        setUiLanguage: (lang: 'zh' | 'en') => set({ uiLanguage: lang }),
        setCategoryLanguage: (lang: 'zh' | 'en') => set({ categoryLanguage: lang }),
        setMaxCategoryDepth: (depth: 1 | 2) => set({ maxCategoryDepth: depth }),
        setMaxCategoryCount: (count) => set({ maxCategoryCount: Math.max(10, Math.min(50, count)) }),
        setPreserveExistingFolders: (val: boolean) => set({ preserveExistingFolders: val }),
        
        setActiveAiProvider: (p: 'gemini-cloud' | 'ollama') => set({ activeAiProvider: p }),
        setGeminiApiKey: (key: string) => set({ geminiApiKey: key.trim() }),
        setGeminiModel: (model: string) => set({ geminiModel: model.trim() }),
        setOllamaUrl: (url: string) => set({ ollamaUrl: url.trim() }),
        setOllamaModel: (model: string) => set({ ollamaModel: model.trim() }),
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
