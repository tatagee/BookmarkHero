/**
 * chrome.storage.local 的 Zustand persist 适配器
 *
 * 原因：Chrome 扩展的 SidePanel、Options、Popup 各页面有独立的 localStorage 作用域，
 * 导致跨页面设置不同步。chrome.storage.local 是扩展全局共享的，能解决此问题。
 */
export const chromeStorageAdapter = {
  getItem: (name: string): Promise<string | null> => {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(name, (result) => {
        if (chrome.runtime.lastError) {
          console.error('[ChromeStorage] getItem failed:', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        const value = result[name];
        resolve(typeof value === 'string' ? value : null);
      });
    });
  },
  setItem: (name: string, value: string): Promise<void> => {
    // Chrome storage.local 单项限制 ~10MB
    const MAX_ITEM_SIZE = 10 * 1024 * 1024;
    if (value.length > MAX_ITEM_SIZE) {
      return Promise.reject(new Error(`Storage item "${name}" exceeds 10MB limit`));
    }
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [name]: value }, () => {
        if (chrome.runtime.lastError) {
          console.error('[ChromeStorage] setItem failed:', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  },
  removeItem: (name: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(name, () => {
        if (chrome.runtime.lastError) {
          console.error('[ChromeStorage] removeItem failed:', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve();
      });
    });
  },
};
