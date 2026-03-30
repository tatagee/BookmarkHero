/**
 * chrome.storage.local 的 Zustand persist 适配器
 *
 * 原因：Chrome 扩展的 SidePanel、Options、Popup 各页面有独立的 localStorage 作用域，
 * 导致跨页面设置不同步。chrome.storage.local 是扩展全局共享的，能解决此问题。
 */
export const chromeStorageAdapter = {
  getItem: (name: string): Promise<string | null> => {
    return new Promise((resolve) => {
      chrome.storage.local.get(name, (result) => {
        const value = result[name];
        resolve(typeof value === 'string' ? value : null);
      });
    });
  },
  setItem: (name: string, value: string): Promise<void> => {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [name]: value }, resolve);
    });
  },
  removeItem: (name: string): Promise<void> => {
    return new Promise((resolve) => {
      chrome.storage.local.remove(name, resolve);
    });
  },
};
