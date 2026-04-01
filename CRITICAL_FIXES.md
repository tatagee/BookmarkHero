# 关键问题修复指南

本文档提供了所有关键和高优先级问题的完整修复代码。

---

## 🔴 关键问题 1: API Key 日志泄露

### 现状代码问题
```typescript
// src/core/providers/gemini-cloud.provider.ts (行 44-59)
try {
  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' },
  });
  // ❌ 问题：如果此处出错，error 对象会被记录，包含 API key
} catch (error) {
  console.error('[GeminiCloudProvider] Classify error:', error); // 危险！
  throw new Error(`分类失败: ${error instanceof Error ? error.message : String(error)}`);
}
```

### 完整修复方案

**文件**: `src/core/providers/gemini-cloud.provider.ts`

```typescript
async classify(
  bookmark: { title: string; url: string; currentPath?: string },
  existingFolders: { id: string; path: string }[]
): Promise<ClassificationResult> {
  const { geminiApiKey, geminiModel } = useSettingsStore.getState();
  if (!geminiApiKey) {
    throw new Error('Gemini API Key is not configured.');
  }

  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: geminiModel || 'gemini-flash-lite-latest' });
    const prompt = this.buildPrompt(bookmark, existingFolders);

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const responseText = result.response.text();
    const parsed = JSON.parse(responseText);

    return this.validateResponse(parsed, existingFolders, bookmark.currentPath);
  } catch (error) {
    // ✅ 改进：分类处理错误，不暴露原始错误对象
    if (error instanceof Error) {
      const message = error.message;

      // 检测认证失败（不记录原始错误，可能包含 key）
      if (message.includes('UNAUTHENTICATED') ||
          message.includes('PERMISSION_DENIED') ||
          message.includes('API key')) {
        console.error('[GeminiCloudProvider] Authentication failed - check API key');
        throw new Error('Gemini API Key 验证失败，请检查密钥是否正确');
      }

      // 其他错误：只记录消息前 100 字符（避免包含长的 token）
      console.error('[GeminiCloudProvider] Classify failed:', message.slice(0, 100));

      // 提供用户友好的错误消息
      if (message.includes('JSON.parse')) {
        throw new Error('AI 服务返回格式错误，请重试');
      }
      if (message.includes('timeout')) {
        throw new Error('AI 服务响应超时，请检查网络或重试');
      }

      throw new Error(`分类失败: ${message.slice(0, 50)}...`);
    }

    // 未知类型的错误
    console.error('[GeminiCloudProvider] Unknown error');
    throw new Error('分类失败: 未知错误');
  }
}

// ✅ 为 isAvailable 添加相同的安全处理
async isAvailable(): Promise<boolean> {
  const { geminiApiKey, geminiModel } = useSettingsStore.getState();
  if (!geminiApiKey) {
    return false;
  }

  try {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: geminiModel || 'gemini-flash-lite-latest' });

    await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: '1' }] }],
      generationConfig: { maxOutputTokens: 1 },
    });

    return true;
  } catch (error) {
    // 安全地记录：不记录原始错误
    if (error instanceof Error) {
      const message = error.message;
      if (message.includes('UNAUTHENTICATED') || message.includes('API key')) {
        console.warn('[GeminiCloudProvider] API key validation failed');
      } else {
        console.warn('[GeminiCloudProvider] Connection check failed:', message.slice(0, 50));
      }
    }
    return false;
  }
}
```

### 额外改进: User-Agent 不要暴露版本

**文件**: `src/background/index.ts`

```typescript
// ❌ 原代码 (行 58)
'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 BookmarkHero/1.0',

// ✅ 修复：移除扩展版本标记，避免指纹识别
'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
```

---

## 🔴 关键问题 2: Service Worker Race Condition

### 问题分析

**文件**: `src/background/index.ts` (行 79-112)

```typescript
// ❌ 问题代码
chrome.runtime.onMessage.addListener(
  (message, _sender, sendResponse) => {
    if (message.type === 'deadlink:check') {
      (async () => {
        const results = [];
        await Promise.all(
          payload.urls.map(async ({ bookmarkId, url }) => {
            const result = await checkUrlAlive(url, payload.timeoutMs);
            results.push({ bookmarkId, url, ...result });
          })
        );
        // ⚠️ 如果上面任何地方抛出异常，这行不会执行
        sendResponse(response);
      })();
      return true;
    }
    return false;
  }
);
```

### 完整修复

```typescript
/**
 * 监听来自前端页面（SidePanel/Options）的消息
 */
chrome.runtime.onMessage.addListener(
  (
    message: { type: string; payload?: unknown },
    _sender,
    sendResponse
  ) => {
    if (message.type === 'deadlink:check') {
      const payload = message.payload as DeadLinkCheckPayload;

      // ✅ 使用 IIFE 确保所有路径都调用 sendResponse
      (async () => {
        const results: UrlCheckResult[] = [];

        try {
          // 逐个检测（background 中不担心 UI 线程阻塞，可使用批量 Promise.all）
          const checkResults = await Promise.all(
            payload.urls.map(async ({ bookmarkId, url }) => {
              const result = await checkUrlAlive(url, payload.timeoutMs);
              return { bookmarkId, url, ...result };
            })
          );

          results.push(...checkResults);

          const response: DeadLinkResultPayload = {
            requestId: payload.requestId,
            results,
          };

          // ✅ 在成功路径调用 sendResponse
          sendResponse(response);
        } catch (error: unknown) {
          // ✅ 在错误路径也调用 sendResponse，防止前端永久挂起
          console.error('[DeadLinkScanner] Batch check error:', error);

          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';

          sendResponse({
            requestId: payload.requestId,
            results: [],
            error: errorMessage,
          } as DeadLinkResultPayload & { error?: string });
        }
      })();

      // 返回 true 表示异步响应
      return true;
    }

    return false;
  }
);
```

### 额外改进：全局 rejection 处理

```typescript
// 添加到 background/index.ts 顶部

// ✅ 处理未捕获的 Promise rejection
if (import.meta.env.DEV) {
  globalThis.addEventListener('unhandledrejection', (event) => {
    console.error('[ServiceWorker] Unhandled rejection:', event.reason);
    // 不调用 preventDefault()，让 Chrome 记录到扩展日志
  });
}

// ✅ 处理运行时错误
globalThis.addEventListener('error', (event) => {
  console.error('[ServiceWorker] Runtime error:', event.error || event.message);
});
```

### 修改 DeadLinkResultPayload 类型

**文件**: `src/shared/messages.ts`

```typescript
/**
 * Background → 前端: 批量检测完成后的结果
 */
export interface DeadLinkResultPayload {
  requestId: string;
  results: UrlCheckResult[];
  error?: string; // ✅ 添加错误字段，当检测失败时返回
}
```

---

## 🟠 高优先级 1: 书签标题 XSS 风险

### 问题代码
```typescript
// src/background/index.ts (行 152)
message: t('background.notify.message', {
  title: bookmark.title,  // ❌ 用户输入，未转义
  path: res.suggestedFolderPath
})
```

### 完整修复

**文件**: `src/background/index.ts`

```typescript
// ✅ 添加转义函数
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}

// ✅ 在通知中使用转义的值
chrome.notifications.create(notifId, {
  type: 'basic',
  iconUrl: chrome.runtime.getURL('icons/icon128.png'),
  title: t('background.notify.title'),
  message: t('background.notify.message', {
    title: escapeHtml(bookmark.title),
    path: escapeHtml(res.suggestedFolderPath),
  }),
  buttons: [{ title: t('common.accept') }, { title: t('common.ignore') }],
  requireInteraction: true,
});
```

---

## 🟠 高优先级 2: Chrome Storage 错误处理

### 问题代码
```typescript
// src/shared/chrome-storage-adapter.ts
export const chromeStorageAdapter = {
  getItem: (name: string): Promise<string | null> => {
    return new Promise((resolve) => {
      chrome.storage.local.get(name, (result) => {
        // ❌ 没有检查 chrome.runtime.lastError
        const value = result[name];
        resolve(typeof value === 'string' ? value : null);
      });
    });
  },
  setItem: (name: string, value: string): Promise<void> => {
    return new Promise((resolve) => {
      // ❌ 没有检查错误或配额限制
      chrome.storage.local.set({ [name]: value }, resolve);
    });
  },
};
```

### 完整修复

**文件**: `src/shared/chrome-storage-adapter.ts`

```typescript
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
        // ✅ 检查 Chrome API 错误
        if (chrome.runtime.lastError) {
          reject(
            new Error(`Failed to read storage '${name}': ${chrome.runtime.lastError.message}`)
          );
          return;
        }

        try {
          const value = result[name];
          const strValue = typeof value === 'string' ? value : null;
          resolve(strValue);
        } catch (error) {
          reject(new Error(`Failed to parse storage value for '${name}'`));
        }
      });
    });
  },

  setItem: (name: string, value: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      // ✅ 检查值大小（Chrome Storage 有 10MB 限制）
      const estimatedSize = new Blob([value]).size;
      if (estimatedSize > 5 * 1024 * 1024) {
        // 5MB 是安全的上限
        reject(
          new Error(
            `Value for '${name}' exceeds storage limit (${estimatedSize} > 5MB)`
          )
        );
        return;
      }

      try {
        chrome.storage.local.set({ [name]: value }, () => {
          // ✅ 检查 Chrome API 错误
          if (chrome.runtime.lastError) {
            reject(
              new Error(
                `Failed to write storage '${name}': ${chrome.runtime.lastError.message}`
              )
            );
          } else {
            resolve();
          }
        });
      } catch (error) {
        reject(new Error(`Failed to serialize value for '${name}'`));
      }
    });
  },

  removeItem: (name: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove(name, () => {
        // ✅ 检查 Chrome API 错误
        if (chrome.runtime.lastError) {
          reject(
            new Error(
              `Failed to remove storage '${name}': ${chrome.runtime.lastError.message}`
            )
          );
        } else {
          resolve();
        }
      });
    });
  },
};
```

### 改进 Zustand Store 的错误处理

**文件**: `src/stores/settings.store.ts`

```typescript
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // ... 状态定义
    }),
    {
      name: STORAGE_KEYS.SETTINGS,
      partialize: (state) =>
        Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'actions')),
      storage: createJSONStorage(() => chromeStorageAdapter),
      // ✅ 添加错误处理
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.error('[SettingsStore] Failed to rehydrate from storage:', error);
          // 恢复到默认值
        } else {
          console.debug('[SettingsStore] Rehydrated from storage');
        }
      },
    }
  )
);
```

---

## 🟠 高优先级 3: React Error Boundary

### 创建 Error Boundary 组件

**新文件**: `src/components/ErrorBoundary.tsx`

```typescript
import React, { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary - 捕获组件树中的错误
 * 防止整个扩展 UI 因为一个组件的错误而崩溃
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 记录错误信息
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    // 调用父级的错误处理回调
    this.props.onError?.(error, errorInfo);

    // 可选：在生产环境发送错误到服务器
    if (!import.meta.env.DEV) {
      // Sentry.captureException(error, { contexts: { react: errorInfo } });
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex flex-col items-center justify-center p-6 bg-destructive/5 border border-destructive/20 rounded-lg">
            <AlertCircle className="w-12 h-12 text-destructive mb-4" />
            <h2 className="font-bold text-destructive text-lg mb-2">出错了</h2>
            <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
              {this.state.error?.message || '发生了未知错误'}
            </p>
            <details className="text-xs text-muted-foreground mb-4 w-full max-w-md">
              <summary className="cursor-pointer mb-2 font-mono">
                {import.meta.env.DEV ? '错误详情' : '报告此错误'}
              </summary>
              {import.meta.env.DEV && (
                <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-40">
                  {this.state.error?.stack}
                </pre>
              )}
            </details>
            <div className="flex gap-2">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-primary text-primary-foreground rounded text-sm font-medium hover:bg-primary/90"
              >
                重试
              </button>
              <button
                onClick={() => location.reload()}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded text-sm font-medium hover:bg-secondary/90"
              >
                重新加载
              </button>
            </div>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
```

### 在 SidePanel 中使用

**文件**: `src/sidepanel/SidePanel.tsx`

```typescript
import { ErrorBoundary } from '../components/ErrorBoundary';

export function SidePanel() {
  return (
    <ErrorBoundary
      onError={(error, errorInfo) => {
        console.error('SidePanel error:', error);
        // 可选：上报错误
      }}
    >
      <div className="space-y-4 p-4">
        {/* ... 你的内容 */}
      </div>
    </ErrorBoundary>
  );
}
```

### 在 Options 中使用

**文件**: `src/options/Options.tsx`

```typescript
import { ErrorBoundary } from '../components/ErrorBoundary';

export function Options() {
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background">
        {/* ... 你的内容 */}
      </div>
    </ErrorBoundary>
  );
}
```

---

## 🟠 高优先级 4: 输入验证

### 创建验证工具函数

**新文件**: `src/lib/validators.ts`

```typescript
/**
 * 验证 Gemini API Key 格式
 */
export function validateGeminiKey(key: string): {
  valid: boolean;
  error?: string;
} {
  if (!key) {
    return { valid: true }; // 空值是允许的（用户未配置）
  }

  // Gemini API Key 通常是 32+ 字符
  if (key.length < 20) {
    return {
      valid: false,
      error: 'API Key 长度不足，请检查是否正确复制',
    };
  }

  // 检查字符是否合法（alphanumeric + underscore + hyphen）
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
    return {
      valid: false,
      error: 'API Key 包含非法字符',
    };
  }

  return { valid: true };
}

/**
 * 验证 Ollama URL
 */
export function validateOllamaUrl(url: string): {
  valid: boolean;
  error?: string;
} {
  if (!url) {
    return { valid: true }; // 空值是允许的
  }

  try {
    const parsed = new URL(url);

    // 只允许 HTTP 和 HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return {
        valid: false,
        error: '仅支持 HTTP 和 HTTPS 协议',
      };
    }

    // 防止连接到外部服务器（只允许本地或特定的可信域名）
    const hostname = parsed.hostname;
    if (
      !hostname.includes('localhost') &&
      !hostname.startsWith('127.') &&
      !hostname.startsWith('192.168.') &&
      !hostname.startsWith('10.') &&
      !hostname.includes('ollama')
    ) {
      return {
        valid: false,
        error: '请使用本地 Ollama 实例或可信的私有服务器',
      };
    }

    return { valid: true };
  } catch {
    return {
      valid: false,
      error: 'URL 格式不正确（应为 http://... 或 https://...）',
    };
  }
}

/**
 * 验证并清理设置值
 */
export function sanitizeSettingValue(value: string, type: 'key' | 'url' | 'text'): string {
  let sanitized = value.trim();

  if (type === 'key') {
    // 移除所有非法字符
    sanitized = sanitized.replace(/[^a-zA-Z0-9_-]/g, '');
  } else if (type === 'url') {
    // 移除前后空白，但保留 URL 结构
    sanitized = sanitized.trim();
  }

  return sanitized;
}
```

### 在设置组件中使用

**文件**: `src/components/settings/AIProviderSettings.tsx`

```typescript
import { useState, useCallback } from 'react';
import { validateGeminiKey, validateOllamaUrl } from '../../lib/validators';

export function AIProviderSettings() {
  const settings = useSettingsStore();
  const actions = useSettingsActions();

  const [geminiKeyError, setGeminiKeyError] = useState<string>();
  const [ollamaUrlError, setOllamaUrlError] = useState<string>();

  const handleGeminiKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const validation = validateGeminiKey(value);

    setGeminiKeyError(validation.error);
    actions.setGeminiApiKey(value);
  }, [actions]);

  const handleOllamaUrlChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const validation = validateOllamaUrl(value);

    setOllamaUrlError(validation.error);
    actions.setOllamaUrl(value);
  }, [actions]);

  return (
    <div className="space-y-6">
      {settings.activeAiProvider === 'gemini-cloud' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Gemini API Key</label>
            <input
              type="password"
              value={settings.geminiApiKey}
              onChange={handleGeminiKeyChange}
              placeholder="YOUR_API_KEY"
              className={`w-full sm:max-w-md flex h-9 rounded-md border px-3 py-1 text-sm ${
                geminiKeyError
                  ? 'border-destructive bg-destructive/5'
                  : 'border-input'
              }`}
            />
            {geminiKeyError && (
              <p className="text-xs text-destructive mt-2">{geminiKeyError}</p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              从 <a href="https://aistudio.google.com/app/apikey" target="_blank"
                    rel="noreferrer" className="underline">Google AI Studio</a> 获取
            </p>
          </div>
        </div>
      )}

      {settings.activeAiProvider === 'ollama' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Ollama URL</label>
            <input
              type="text"
              value={settings.ollamaUrl}
              onChange={handleOllamaUrlChange}
              placeholder="http://localhost:11434"
              className={`w-full sm:max-w-md flex h-9 rounded-md border px-3 py-1 text-sm ${
                ollamaUrlError
                  ? 'border-destructive bg-destructive/5'
                  : 'border-input'
              }`}
            />
            {ollamaUrlError && (
              <p className="text-xs text-destructive mt-2">{ollamaUrlError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## 🟠 高优先级 5: ConcurrencyQueue 内存泄漏

### 问题代码
```typescript
// src/core/utils/concurrency.ts
export class ConcurrencyQueue {
  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.activeCount >= this.limit) {
      // ⚠️ 如果 Promise 被取消，resolver 留在队列中
      await new Promise<void>(resolve => {
        this.queue.push(resolve);
      });
    }
    // ...
  }
}
```

### 完整修复

**文件**: `src/core/utils/concurrency.ts`

```typescript
/**
 * 并发控制队列
 * 用于限制同时进行的网络请求（如死链检测）数量
 */
export class ConcurrencyQueue {
  private activeCount = 0;
  private queue: (() => void)[] = [];
  private limit: number;
  private isAborted = false;

  constructor(concurrencyLimit: number) {
    this.limit = Math.max(1, concurrencyLimit);
  }

  /**
   * 将任务推入执行队列
   * @param task 返回 Promise 的异步任务执行函数
   */
  async run<T>(task: () => Promise<T>): Promise<T> {
    // ✅ 检查队列是否已被终止
    if (this.isAborted) {
      throw new Error('ConcurrencyQueue has been aborted');
    }

    if (this.activeCount >= this.limit) {
      // 队列已满，挂起等待
      await new Promise<void>((resolve, reject) => {
        const resolver = () => {
          // ✅ 检查队列是否在等待期间被终止
          if (this.isAborted) {
            reject(new Error('Queue aborted while waiting'));
          } else {
            resolve();
          }
        };
        this.queue.push(resolver);
      });
    }

    this.activeCount++;
    try {
      return await task();
    } finally {
      this.activeCount--;

      // ✅ 在终止时不再唤醒队列中的 resolver
      if (!this.isAborted && this.queue.length > 0) {
        const next = this.queue.shift();
        next?.();
      }
    }
  }

  /**
   * 终止队列并清理所有挂起的任务
   * 用于扫描取消或组件卸载时清理资源
   */
  abort(): void {
    this.isAborted = true;

    // ✅ 清空队列，触发所有挂起的 Promise 的 rejection
    const queue = this.queue;
    this.queue = [];

    for (const resolver of queue) {
      resolver(); // 触发 reject
    }
  }

  /**
   * 获取当前队列状态（用于调试）
   */
  getStatus(): { active: number; waiting: number; isAborted: boolean } {
    return {
      active: this.activeCount,
      waiting: this.queue.length,
      isAborted: this.isAborted,
    };
  }
}
```

### 在 Dead Link Scanner 中使用 abort

**文件**: `src/core/scanners/dead-link.scanner.ts`

```typescript
export class DeadLinkScanner implements IScanner {
  public id = 'dead-link-scanner';
  public name = 'scanner.deadLink.name';
  public description = 'scanner.deadLink.desc';

  private isCancelled = false;
  private concurrencyQueue: ConcurrencyQueue | null = null;

  async scan(
    nodes: chrome.bookmarks.BookmarkTreeNode[],
    options?: ScanOptions,
    onProgress?: (progress: ScanProgress) => void
  ): Promise<ScanResult> {
    this.isCancelled = false;
    const startTime = Date.now();
    const issues: ScanIssue[] = [];

    // ... 其他代码

    const effectiveConcurrency = options?.maxConcurrency ?? SCAN_CONFIG.MAX_CONCURRENCY;
    this.concurrencyQueue = new ConcurrencyQueue(effectiveConcurrency); // ✅ 保存引用
    const queue = this.concurrencyQueue;

    // ... 其他代码

    // 创建检查 Promise
    const checkPromises = batches.map((batch) => {
      return queue.run(async () => {
        if (this.isCancelled) return;
        // ... 检测逻辑
      });
    });

    await Promise.all(checkPromises);

    // ✅ 清理
    this.concurrencyQueue = null;

    return {
      scannerId: this.id,
      issues,
      stats: {
        totalScanned: scannedCount,
        issuesFound: issues.length,
        duration: Date.now() - startTime,
      },
    };
  }

  cancel(): void {
    this.isCancelled = true;
    // ✅ 终止并清理队列
    if (this.concurrencyQueue) {
      this.concurrencyQueue.abort();
      this.concurrencyQueue = null;
    }
  }
}
```

---

## 📋 快速应用清单

完成以下步骤来应用所有关键修复：

- [ ] 1. API Key 日志处理修复
- [ ] 2. Service Worker Race Condition 修复
- [ ] 3. 修改消息类型定义 (DeadLinkResultPayload)
- [ ] 4. 书签标题 XSS 转义
- [ ] 5. Chrome Storage 错误处理
- [ ] 6. Error Boundary 组件创建和应用
- [ ] 7. 验证函数创建和应用
- [ ] 8. ConcurrencyQueue 改进
- [ ] 9. 测试所有修复
- [ ] 10. 运行 `npm run build` 验证编译

---

**完成时间**: ~4-6 小时（如果逐个应用）
**需要帮助**: 如果卡在任何地方，请参考原始问题的详细说明
