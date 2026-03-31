/**
 * 全局测试 Setup
 * 在每个测试文件执行前自动运行，模拟 Chrome Extension 运行环境
 */
import '@testing-library/jest-dom/vitest';
import { vi, beforeEach } from 'vitest';

// ---- chrome.bookmarks Mock ----
// 内部存储，测试可以通过它来预置数据
export const mockBookmarkStore = new Map<string, chrome.bookmarks.BookmarkTreeNode>();

/**
 * chrome-api.ts 使用的是回调风格的 Chrome API（chrome.bookmarks.get(id, callback)）
 * 因此 mock 必须模拟回调，而非返回 Promise
 */
const mockBookmarksApi = {
  getTree: vi.fn((...args: unknown[]) => {
    const callback = args[args.length - 1] as (results: chrome.bookmarks.BookmarkTreeNode[]) => void;
    if (typeof callback === 'function') callback([]);
  }),
  get: vi.fn((...args: unknown[]) => {
    const id = args[0] as string;
    const callback = args[args.length - 1] as (results: chrome.bookmarks.BookmarkTreeNode[]) => void;
    const node = mockBookmarkStore.get(id);
    if (!node) {
      // 模拟 Chrome 行为：找不到节点时设置 lastError
      (chrome.runtime as { lastError: chrome.runtime.LastError | null }).lastError = { message: `Bookmark not found: ${id}` };
      if (typeof callback === 'function') callback([]);
      (chrome.runtime as { lastError: chrome.runtime.LastError | null }).lastError = null;
      return;
    }
    if (typeof callback === 'function') callback([node]);
  }),
  remove: vi.fn((...args: unknown[]) => {
    const id = args[0] as string;
    const callback = args[args.length - 1] as (() => void) | undefined;
    mockBookmarkStore.delete(id);
    if (typeof callback === 'function') callback();
  }),
  removeTree: vi.fn((...args: unknown[]) => {
    const id = args[0] as string;
    const callback = args[args.length - 1] as (() => void) | undefined;
    mockBookmarkStore.delete(id);
    if (typeof callback === 'function') callback();
  }),
  create: vi.fn((...args: unknown[]) => {
    const details = args[0] as { parentId?: string; index?: number; title?: string; url?: string };
    const callback = args[args.length - 1] as ((result: chrome.bookmarks.BookmarkTreeNode) => void) | undefined;
    const node = {
      id: `new-${Date.now()}`,
      title: details.title || '',
      url: details.url,
      parentId: details.parentId,
      index: details.index,
    } as chrome.bookmarks.BookmarkTreeNode;
    mockBookmarkStore.set(node.id, node);
    if (typeof callback === 'function') callback(node);
  }),
  search: vi.fn(),
  move: vi.fn(),
};

// ---- chrome.storage.local Mock ----
const storageData: Record<string, unknown> = {};
const mockStorageLocal = {
  get: vi.fn().mockImplementation(async (key: string) => {
    return { [key]: storageData[key] ?? null };
  }),
  set: vi.fn().mockImplementation(async (items: Record<string, unknown>) => {
    Object.assign(storageData, items);
  }),
  remove: vi.fn().mockImplementation(async (key: string) => {
    delete storageData[key];
  }),
};

// ---- chrome.runtime Mock ----
const mockRuntime = {
  sendMessage: vi.fn(),
  lastError: null as chrome.runtime.LastError | null,
  openOptionsPage: vi.fn(),
};

// ---- chrome.sidePanel Mock ----
const mockSidePanel = {
  setPanelBehavior: vi.fn().mockResolvedValue(undefined),
};

// ---- 挂载到 globalThis ----
const chromeMock = {
  bookmarks: mockBookmarksApi,
  storage: { local: mockStorageLocal },
  runtime: mockRuntime,
  sidePanel: mockSidePanel,
};

Object.defineProperty(globalThis, 'chrome', {
  value: chromeMock,
  writable: true,
  configurable: true,
});

// ---- 每个测试前重置 Mock 状态 ----
beforeEach(() => {
  vi.clearAllMocks();
  mockBookmarkStore.clear();
  Object.keys(storageData).forEach(key => delete storageData[key]);
  mockRuntime.lastError = null;
});

export { mockBookmarksApi, mockStorageLocal, mockRuntime };
