import { useState, useMemo } from 'react';
import { useBookmarkStore } from '../../stores/bookmark.store';
import { ClassificationService } from '../../core/services/classification.service';
import type { ClassificationResult } from '../../core/providers/types';
import { Button } from '../ui/button';
import { Loader2, ArrowRight, Check, FolderSearch, Zap, Search } from 'lucide-react';
import { moveBookmark, ensureFolderExists } from '../../shared/chrome-api';
import { ConcurrencyQueue } from '../../core/utils/concurrency';
import { useSettingsStore } from '../../stores/settings.store';

// === 数据模型 ===

type ScanMode = 'quick' | 'deep';
type FilterTab = 'all' | 'move' | 'keep';
type ItemStatus = 'pending' | 'classifying' | 'done' | 'error';

interface BookmarkItem {
  id: string;
  title: string;
  url: string;
  currentPath: string;        // 书签当前所在的文件夹路径
  result?: ClassificationResult;
  status: ItemStatus;
  errorMsg?: string;
}

// === 工具函数 ===

/** 递归遍历书签树，提取全部带 URL 的书签及其路径 */
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
        status: 'pending',
      });
    }
    if (node.children) {
      const nextPath = currentPath ? `${currentPath}/${node.title}` : node.title;
      items.push(...collectAllBookmarks(node.children, nextPath));
    }
  }
  return items;
}

/** 只收集根节点下直接挂载的松散书签（快速模式） */
function collectRootBookmarks(
  rootNodes: chrome.bookmarks.BookmarkTreeNode[],
  includeBookmarksBar: boolean
): BookmarkItem[] {
  const items: BookmarkItem[] = [];
  for (const root of rootNodes) {
    // id="1" 通常是书签栏
    if (!includeBookmarksBar && root.id === '1') continue;

    for (const node of root.children || []) {
      if (node.url) {
        items.push({
          id: node.id,
          title: node.title,
          url: node.url,
          currentPath: root.title || '(根目录)',
          status: 'pending',
        });
      }
    }
  }
  return items;
}

// === 组件 ===

export function AIClassifierPanel() {
  const [items, setItems] = useState<BookmarkItem[]>([]);
  const [scanMode, setScanMode] = useState<ScanMode>('quick');
  const [includeBookmarksBar, setIncludeBookmarksBar] = useState(false);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [isScanning, setIsScanning] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const tree = useBookmarkStore((state) => state.tree);
  const refreshBookmarks = useBookmarkStore((state) => state.refreshBookmarks);
  const maxConcurrency = useSettingsStore((state) => state.maxConcurrency);

  // === 1. 扫描逻辑 ===

  const handleScan = () => {
    setIsScanning(true);
    setFilterTab('all');
    setProgress({ done: 0, total: 0 });

    const rootNodes = tree[0]?.children || [];

    let scanned: BookmarkItem[];

    if (scanMode === 'quick') {
      scanned = collectRootBookmarks(rootNodes, includeBookmarksBar);
    } else {
      // 深度模式，遍历全级别
      const allItems: BookmarkItem[] = [];
      for (const root of rootNodes) {
        if (!includeBookmarksBar && root.id === '1') continue;
        allItems.push(...collectAllBookmarks(root.children || [], root.title));
      }
      scanned = allItems;
    }

    setItems(scanned);
    setIsScanning(false);
  };

  // === 2. 批量 AI 分析 ===

  const handleClassifyAll = async () => {
    setIsClassifying(true);
    const pending = items.filter((i) => i.status === 'pending');
    setProgress({ done: 0, total: pending.length });

    const service = new ClassificationService();
    const queue = new ConcurrencyQueue(maxConcurrency);
    let completed = 0;

    const tasks = items.map((item, idx) => async () => {
      if (item.status !== 'pending') return;

      // 标记为"正在分析"
      setItems((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], status: 'classifying' };
        return next;
      });

      try {
        const res = await service.classify({
          title: item.title,
          url: item.url,
          currentPath: item.currentPath,
        });
        setItems((prev) => {
          const next = [...prev];
          next[idx] = { ...next[idx], result: res, status: 'done' };
          return next;
        });
      } catch (err) {
        setItems((prev) => {
          const next = [...prev];
          next[idx] = {
            ...next[idx],
            status: 'error',
            errorMsg: err instanceof Error ? err.message : String(err),
          };
          return next;
        });
      } finally {
        completed++;
        setProgress((p) => ({ ...p, done: completed }));
      }
    });

    await Promise.all(tasks.map((t) => queue.run(t)));
    setIsClassifying(false);
  };

  // === 3. 单条 & 批量操作 ===

  const acceptSuggestion = async (item: BookmarkItem, idx: number) => {
    if (!item.result || item.result.action === 'keep') return;

    try {
      let targetId = item.result.suggestedFolderId;

      if (targetId === 'fallback_id_or_create_new' || targetId === 'fallback') {
        targetId = await ensureFolderExists(item.result.suggestedFolderPath);
      }

      await moveBookmark(item.id, { parentId: targetId });
      setItems((prev) => prev.filter((_, i) => i !== idx));
      refreshBookmarks();
    } catch (err) {
      alert('移动归类失败: ' + err);
    }
  };

  const acceptAll = async () => {
    const moveItems = items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => item.result?.action === 'move');

    for (const { item, idx } of moveItems) {
      await acceptSuggestion(item, idx);
    }
  };

  // === 4. 过滤与统计 ===

  const stats = useMemo(() => {
    const total = items.length;
    const done = items.filter((i) => i.status === 'done').length;
    const needMove = items.filter((i) => i.result?.action === 'move').length;
    const correct = items.filter((i) => i.result?.action === 'keep').length;
    return { total, done, needMove, correct };
  }, [items]);

  const filteredItems = useMemo(() => {
    if (filterTab === 'move') return items.filter((i) => i.result?.action === 'move');
    if (filterTab === 'keep') return items.filter((i) => i.result?.action === 'keep');
    return items;
  }, [items, filterTab]);

  // === 5. 渲染 ===

  return (
    <div className="bg-card border rounded-lg p-6 space-y-5">
      {/* 标题 + 扫描控制 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FolderSearch className="w-5 h-5 text-primary" />
            AI 智能整理
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            全量审查书签，找出未分类和错误归类的条目。
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
            >
              <Zap className="w-3 h-3" /> 快速
            </button>
            <button
              onClick={() => setScanMode('deep')}
              className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                scanMode === 'deep'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Search className="w-3 h-3" /> 深度
            </button>
          </div>
          <Button onClick={handleScan} disabled={isScanning || isClassifying}>
            {isScanning ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            扫描
          </Button>
        </div>
      </div>

      {/* 书签栏选项 */}
      <label className="flex items-center gap-2 text-sm text-foreground">
        <input
          type="checkbox"
          checked={includeBookmarksBar}
          onChange={(e) => setIncludeBookmarksBar(e.target.checked)}
          className="rounded border-input text-primary focus:ring-primary"
        />
        包含"书签栏"
        <span className="text-xs text-muted-foreground">(默认跳过，因为多为高频快捷访问)</span>
      </label>

      {/* 扫描结果面板 */}
      {items.length > 0 && (
        <div className="space-y-4">
          {/* 操作栏 */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-muted/30 p-3 rounded">
            <div className="text-sm space-y-1">
              <span>
                扫描到 <strong>{stats.total}</strong> 个书签
                {stats.done > 0 && (
                  <span className="text-muted-foreground ml-2">
                    · 已分析 {stats.done}{stats.needMove > 0 && ` · 需整理 ${stats.needMove}`}{stats.correct > 0 && ` · 正确 ${stats.correct}`}
                  </span>
                )}
              </span>
              {isClassifying && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  分析中 {progress.done}/{progress.total}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleClassifyAll}
                disabled={isClassifying || stats.done === stats.total}
              >
                {isClassifying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                开始分析
              </Button>
              {stats.needMove > 0 && (
                <Button size="sm" onClick={acceptAll} disabled={isClassifying}>
                  全部接受 ({stats.needMove})
                </Button>
              )}
            </div>
          </div>

          {/* 过滤 Tab */}
          {stats.done > 0 && (
            <div className="flex gap-1 p-1 bg-muted rounded-lg w-max">
              <button
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  filterTab === 'all' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                全部 ({stats.total})
              </button>
              <button
                onClick={() => setFilterTab('move')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  filterTab === 'move' ? 'bg-background shadow-sm text-orange-600' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                ⚠ 需整理 ({stats.needMove})
              </button>
              <button
                onClick={() => setFilterTab('keep')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  filterTab === 'keep' ? 'bg-background shadow-sm text-green-600' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                ✅ 正确 ({stats.correct})
              </button>
            </div>
          )}

          {/* 书签列表 */}
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
            {filteredItems.map((item) => {
              // 在完整 items 数组中找到真实的 index
              const realIdx = items.findIndex((i) => i.id === item.id);
              return (
                <div
                  key={item.id}
                  className={`border p-3 rounded flex items-start justify-between gap-4 transition-colors ${
                    item.result?.action === 'move'
                      ? 'border-orange-200 bg-orange-50/30 dark:border-orange-900/30 dark:bg-orange-950/10'
                      : item.result?.action === 'keep'
                        ? 'border-green-200 bg-green-50/30 dark:border-green-900/30 dark:bg-green-950/10'
                        : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm" title={item.title}>
                      {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{item.url}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      📂 当前: <span className="font-medium">{item.currentPath}</span>
                    </p>

                    {/* 状态展示 */}
                    {item.status === 'classifying' && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> 分析中...
                      </div>
                    )}

                    {item.status === 'error' && (
                      <p className="text-xs text-red-500 mt-2">❌ {item.errorMsg}</p>
                    )}

                    {item.result && item.result.action === 'move' && (
                      <div className="bg-primary/5 p-2 mt-2 rounded text-sm border border-primary/10">
                        <div className="flex items-center gap-2 text-primary font-medium mb-1">
                          <ArrowRight className="h-4 w-4" />
                          {item.result.suggestedFolderPath}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {item.result.reasoning} (置信度 {Math.round(item.result.confidence * 100)}%)
                        </p>
                      </div>
                    )}

                    {item.result && item.result.action === 'keep' && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-green-600">
                        <Check className="h-3 w-3" /> 位置正确 — {item.result.reasoning}
                      </div>
                    )}
                  </div>

                  {/* 右侧操作按钮 */}
                  <div className="shrink-0 flex flex-col gap-2">
                    {item.result?.action === 'move' && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => acceptSuggestion(item, realIdx)}
                      >
                        ✅ 接受
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 空状态 */}
      {items.length === 0 && !isScanning && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <FolderSearch className="w-10 h-10 mx-auto mb-3 opacity-30" />
          点击上方「扫描」按钮开始分析您的书签库
        </div>
      )}
    </div>
  );
}
