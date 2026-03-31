import { useSettingsStore } from '../stores/settings.store';
import { zh } from './zh';
import { en } from './en';
import type { TranslationKeys } from './types';

const dictMap = { zh, en } as const;

export function useT() {
  const lang = useSettingsStore((state) => state.uiLanguage);
  // 实时根据 zustand store 获取当前语言的字典
  const dict = dictMap[lang] || dictMap.zh;

  /**
   * 翻译函数，支持 '{xx}' 形式的变量插值
   * @param key 翻译的键名
   * @param vars 需要插值的变量映射
   */
  return function t(key: keyof TranslationKeys, vars?: Record<string, string | number>): string {
    const rawVal = dict[key];
    if (rawVal === undefined) {
      console.warn(`[i18n] Missing translation for key: ${String(key)}`);
      return String(key); // Fallback to key itself
    }
    
    let text = String(rawVal);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  };
}

export function getStaticT(lang: 'zh' | 'en') {
  const dict = dictMap[lang] || dictMap.zh;
  
  return function t(key: keyof TranslationKeys, vars?: Record<string, string | number>): string {
    const rawVal = dict[key];
    if (rawVal === undefined) {
      return String(key);
    }
    
    let text = String(rawVal);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  };
}

/** 供非 React（例如 Scanner 等类或纯函数）环境调用 */
export function getT() {
  const lang = useSettingsStore.getState().uiLanguage;
  const dict = dictMap[lang] || dictMap.zh;
  
  return function t(key: keyof TranslationKeys, vars?: Record<string, string | number>): string {
    const rawVal = dict[key];
    if (rawVal === undefined) {
      return String(key);
    }
    
    let text = String(rawVal);
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        text = text.replace(`{${k}}`, String(v));
      }
    }
    return text;
  };
}
