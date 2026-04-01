import { useState, useMemo, useRef, useEffect } from 'react';
import { useBookmarkStore } from '../../stores/bookmark.store';
import { ClassificationService } from '../../core/services/classification.service';
import type { ClassificationResult } from '../../core/providers/types';
import { Button } from '../ui/button';
import { Loader2, ArrowRight, Check, FolderSearch, Zap, Search, Sparkles } from 'lucide-react';
import { ensureFolderExists } from '../../shared/chrome-api';
import { ConcurrencyQueue } from '../../core/utils/concurrency';
import { useSettingsStore } from '../../stores/settings.store';
import { useLogStore } from '../../stores/log.store';
import { MoveAction } from '../../core/actions/move.action';
import { useT } from '../../i18n';
import { toast } from 'sonner';

// === 数据模型 ===

type ScanMode = 'quick' | 'deep';
type FilterTab = 'all' | 'move' | 'keep';

interface BookmarkItem {
  id: string;
  title: string;
  url: string;
  currentPath: string;
  result?: ClassificationResult;
}

// === 工具函数 ===

/** 收集根节点下直接挂载的书签（快速模式：只找"没放进子文件夹"的松散书签） */
function collectRootBookmarks(
  rootNodes: chrome.bookmarks.BookmarkTreeNode[]
): BookmarkItem[] {
  const items: BookmarkItem[] = [];
  for (const root of rootNodes) {
    for (const node of root.children || []) {
      if (node.url) {
        items.push({
          id: node.id,
          title: node.title,
          url: node.url,
          currentPath: root.title || '(根目录)',
        });
      }
    }
  }
  return items;
}

/** 递归遍历全树，收集所有带 URL 的书签（深度模式） */
function collectAllBookmarks(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  currentPath: string
): BookmarkItem[] {
  const items: BookmarkItem[] = [];
  for (const node of nodes) {
    if (node.url) {
      items.push({
        id: node.id,
        title: node.title,
        url: node.url,
        currentPath: currentPath || '(根目录)',
      });
    }
    if (node.children) {
      const nextPath = currentPath ? `${currentPath}/${node.title}` : node.title;
      items.push(...collectAllBookmarks(node.children, nextPath));
    }
  }
  return items;
}

// === 组件 ===

export function AIClassifierPanel() {
  const [scanMode, setScanMode] = useState<ScanMode>('quick');
  const [filterTab, setFilterTab] = useState<FilterTab>('move');
  const [isRunning, setIsRunning] = useState(false);
  const [items, setItems] = useState<BookmarkItem[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [hasRun, setHasRun] = useState(false);
  const [includeBookmarksBar, setIncludeBookmarksBar] = useState(false);

  const queueRef = useRef<ConcurrencyQueue | null>(null);

  useEffect(() => {
    return () => {
      // 卸载时中止队列，防内存泄漏
      queueRef.current?.abort();
    };
  }, []);

  const tree = useBookmarkStore((state) => state.tree);
  const refreshBookmarks = useBookmarkStore((state) => state.refreshBookmarks);
  const maxConcurrency = useSettingsStore((state) => state.maxConcurrency);
  const addLog = useLogStore((state) => state.addLog);
  const t = useT();

  // === 核心：一键扫描 + AI 分析 ===
  const handleStart = async () => {
    setIsRunning(true);
    setHasRun(true);
    setItems([]);
    setFilterTab('move');

    // 1. 收集书签（根据「包含书签栏」开关过滤）
    const allRootNodes = tree[0]?.children || [];
    const rootNodes = allRootNodes.filter((node) => {
      if (!includeBookmarksBar) {
        // Chrome 书签栏固定 ID 为 '1'，同时兼容不同语言 locale 的名称匹配
        if (node.id === '1' || /^(Bookmarks bar|书签栏|Bookmarks Bar)$/i.test(node.title)) {
          return false;
        }
      }
      return true;
    });
    let collected: BookmarkItem[];

    if (scanMode === 'quick') {
      // 快速模式：包含所有根节点下直接挂的松散书签
      collected = collectRootBookmarks(rootNodes);
    } else {
      // 深度模式：遍历全树
      const all: BookmarkItem[] = [];
      for (const root of rootNodes) {
        all.push(...collectAllBookmarks(root.children || [], root.title));
      }
      collected = all;
    }

    if (collected.length === 0) {
      setIsRunning(false);
      return;
    }

    setProgress({ done: 0, total: collected.length });

    // 2. 立刻批量调用 AI 分析，用并发队列限流
    const service = new ClassificationService();
    await service.preloadFolders(); // 预加载文件夹列表，所有并发分析复用同一份缓存
    const queue = new ConcurrencyQueue(maxConcurrency);
    queueRef.current = queue;
    const results: BookmarkItem[] = [];
    let completed = 0;

    const tasks = collected.map((item) => async () => {
      try {
        const res = await service.classify({
          title: item.title,
          url: item.url,
          currentPath: item.currentPath,
        });
        results.push({ ...item, result: res });
      } catch (err) {
        console.error(`[AI整理] ${item.title} 分析失败:`, err);
        // 出错的不放入结果
      } finally {
        completed++;
        setProgress({ done: completed, total: collected.length });
      }
    });

    await Promise.all(tasks.map((t) => queue.run(t)));

    // 3. 按 move 优先排序结果
    results.sort((a, b) => {
      if (a.result?.action === 'move' && b.result?.action !== 'move') return -1;
      if (a.result?.action !== 'move' && b.result?.action === 'move') return 1;
      return (b.result?.confidence ?? 0) - (a.result?.confidence ?? 0);
    });

    setItems(results);
    setIsRunning(false);
    queueRef.current = null;
  };

  const handleStop = () => {
    queueRef.current?.abort();
    setIsRunning(false);
    queueRef.current = null;
  };

  // === 接受建议 ===
  const acceptSuggestion = async (item: BookmarkItem, skipRefresh = false) => {
    if (!item.result || item.result.action === 'keep') return;

    try {
      let targetId = item.result.suggestedFolderId;
      if (targetId === 'fallback_id_or_create_new' || targetId === 'fallback') {
        targetId = await ensureFolderExists(item.result.suggestedFolderPath);
      }
      
      const action = new MoveAction();
      const undoInfo = await action.execute({
        bookmarkId: item.id,
        payload: { parentId: targetId }
      });

      if (undoInfo) {
        addLog({
          id: crypto.randomUUID(),
          actionId: action.id,
          description: t('ai.logDesc.move', { path: item.result.suggestedFolderPath }),
          undoInfo,
          bookmarkTitle: item.title,
          bookmarkUrl: item.url,
          folderPath: item.currentPath,
        });
      }

      setItems((prev) => prev.filter((i) => i.id !== item.id));
      if (!skipRefresh) refreshBookmarks();
    } catch (err) {
      toast.error(t('ai.moveFailed', { err: String(err) }));
    }
  };

  const acceptAll = async () => {
    const moveItems = items.filter((i) => i.result?.action === 'move');
    // 使用并发队列限制 Chrome API 并发，避免超载导致操作失败
    const queue = new ConcurrencyQueue(Math.min(maxConcurrency, 5));
    await Promise.all(
      moveItems.map((item) => queue.run(() => acceptSuggestion(item, true)))
    );
    refreshBookmarks();
  };

  // === 统计 & 过滤 ===
  const stats = useMemo(() => {
    const total = items.length;
    const needMove = items.filter((i) => i.result?.action === 'move').length;
    const correct = items.filter((i) => i.result?.action === 'keep').length;
    return { total, needMove, correct };
  }, [items]);

  const filteredItems = useMemo(() => {
    if (filterTab === 'move') return items.filter((i) => i.result?.action === 'move');
    if (filterTab === 'keep') return items.filter((i) => i.result?.action === 'keep');
    return items;
  }, [items, filterTab]);

  // === 渲染 ===
  return (
    <div className="bg-card border rounded-lg p-6 space-y-5">
      {/* 初始化指引图文 */}
      {!isRunning && items.length === 0 && (
        <div className="py-12 border-2 border-dashed rounded-xl border-muted flex flex-col items-center justify-center text-center px-4">
          <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <h3 className="font-medium text-lg mb-2">{t('ai.guide.title')}</h3>
          <div className="text-sm text-muted-foreground max-w-sm space-y-2">
            <p className="flex items-start gap-2">
              <Zap className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="text-left">{t('ai.guide.quick')}</span>
            </p>
            <p className="flex items-start gap-2">
              <Search className="w-4 h-4 mt-0.5 shrink-0" />
              <span className="text-left">{t('ai.guide.deep')}</span>
            </p>
          </div>
        </div>
      )}

      {/* 标题行 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FolderSearch className="w-5 h-5 text-primary" />
            {t('ai.title')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t('ai.subtitle')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* 模式切换 */}
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            <button
              onClick={() => setScanMode('quick')}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                scanMode === 'quick'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={t('ai.mode.quickTip')}
            >
              <Zap className="w-3 h-3" /> {t('ai.mode.quick')}
            </button>
            <button
              onClick={() => setScanMode('deep')}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                scanMode === 'deep'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={t('ai.mode.deepTip')}
            >
              <Search className="w-3 h-3" /> {t('ai.mode.deep')}
            </button>
          </div>

          {/* 书签栏保护开关 */}
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none" title={t('ai.includeBookmarksBarTip')}>
            <input
              type="checkbox"
              checked={includeBookmarksBar}
              onChange={(e) => setIncludeBookmarksBar(e.target.checked)}
              className="rounded border-input"
            />
            {t('ai.includeBookmarksBar')}
          </label>

          {isRunning ? (
            <Button variant="destructive" onClick={handleStop}>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              {t('common.cancel')} ({progress.done}/{progress.total})
            </Button>
          ) : (
            <Button onClick={handleStart}>
              {t('ai.btnStart')}
            </Button>
          )}
        </div>
      </div>

      {/* 进度条 */}
      {isRunning && progress.total > 0 && (
        <div className="space-y-1">
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center">
            {t('ai.progressTip', { done: progress.done, total: progress.total })}
          </p>
        </div>
      )}

      {/* 结果面板 */}
      {hasRun && !isRunning && (
        <div className="space-y-4">
          {/* 摘要 */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-muted/30 border rounded-lg">
            <div className="text-sm">
              <span dangerouslySetInnerHTML={{ __html: t('ai.summary.analyzed', { total: stats.total }) }} className="mr-4" />
              {stats.needMove > 0 && <span className="text-destructive font-medium mr-4">{t('ai.summary.needMove', { count: stats.needMove })}</span>}
              {stats.correct > 0 && <span className="text-emerald-600 font-medium">{t('ai.summary.correct', { count: stats.correct })}</span>}
            </div>
            {stats.total === 0 && (
              <span className="text-sm text-muted-foreground">{t('ai.summary.empty')}</span>
            )}
            {stats.needMove > 0 && (
              <Button size="sm" onClick={acceptAll}>
                {t('ai.btnAcceptAll', { count: stats.needMove })}
              </Button>
            )}
          </div>

          {/* 过滤 Tab */}
          {stats.total > 0 && (
            <div className="flex gap-1 p-1 bg-muted rounded-lg w-max">
              <button
                onClick={() => setFilterTab('move')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  filterTab === 'move' ? 'bg-background shadow-sm text-destructive' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('ai.tab.move', { count: stats.needMove })}
              </button>
              <button
                onClick={() => setFilterTab('keep')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  filterTab === 'keep' ? 'bg-background shadow-sm text-emerald-600' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('ai.tab.keep', { count: stats.correct })}
              </button>
              <button
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  filterTab === 'all' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t('ai.tab.all', { count: stats.total })}
              </button>
            </div>
          )}

          {/* 书签列表 */}
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
            {filteredItems.length === 0 && stats.total > 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                {filterTab === 'move'
                  ? t('ai.empty.move')
                  : t('ai.empty.filter')}
              </div>
            )}
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className={`border p-3 rounded transition-colors ${
                  item.result?.action === 'move'
                    ? 'border-orange-200 bg-orange-50/30'
                    : 'border-green-200 bg-green-50/30'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm" title={item.title}>
                      {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{item.url}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t('ai.item.currentDir', { path: item.currentPath })}
                    </p>

                    {item.result?.action === 'move' && (
                      <div className="bg-primary/5 p-2 mt-2 rounded text-sm border border-primary/10">
                        <div className="flex items-center gap-2 text-primary font-medium mb-1">
                          <ArrowRight className="h-4 w-4" />
                          {t('ai.item.suggestDir', { path: item.result.suggestedFolderPath })}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t('ai.item.reason.move', { reason: item.result.reasoning, confidence: Math.round(item.result.confidence * 100) })}
                        </p>
                      </div>
                    )}

                    {item.result?.action === 'keep' && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-green-600">
                        <Check className="h-3 w-3" /> {t('ai.item.reason.keep', { reason: item.result.reasoning })}
                      </div>
                    )}
                  </div>

                  {item.result?.action === 'move' && (
                    <div className="shrink-0">
                      <Button size="sm" onClick={() => acceptSuggestion(item)}>
                        {t('ai.item.btnAccept')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
