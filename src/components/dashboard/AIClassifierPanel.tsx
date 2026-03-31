import { useState, useMemo } from 'react';
import { useBookmarkStore } from '../../stores/bookmark.store';
import { ClassificationService } from '../../core/services/classification.service';
import type { ClassificationResult } from '../../core/providers/types';
import { Button } from '../ui/button';
import { Loader2, ArrowRight, Check, FolderSearch, Zap, Search } from 'lucide-react';
import { ensureFolderExists } from '../../shared/chrome-api';
import { ConcurrencyQueue } from '../../core/utils/concurrency';
import { useSettingsStore } from '../../stores/settings.store';
import { useLogStore } from '../../stores/log.store';
import { MoveAction } from '../../core/actions/move.action';

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

  const tree = useBookmarkStore((state) => state.tree);
  const refreshBookmarks = useBookmarkStore((state) => state.refreshBookmarks);
  const maxConcurrency = useSettingsStore((state) => state.maxConcurrency);
  const addLog = useLogStore((state) => state.addLog);

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
  };

  // === 接受建议 ===
  const acceptSuggestion = async (item: BookmarkItem) => {
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
          description: `将书签移动至 "${item.result.suggestedFolderPath}"`,
          undoInfo,
          bookmarkTitle: item.title,
          bookmarkUrl: item.url,
          folderPath: item.currentPath,
        });
      }

      setItems((prev) => prev.filter((i) => i.id !== item.id));
      refreshBookmarks();
    } catch (err) {
      alert('移动失败: ' + err);
    }
  };

  const acceptAll = async () => {
    const moveItems = items.filter((i) => i.result?.action === 'move');
    for (const item of moveItems) {
      await acceptSuggestion(item);
    }
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
      {/* 标题行 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FolderSearch className="w-5 h-5 text-primary" />
            AI 智能整理
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            一键扫描并分析，自动找出需要重新归类的书签。
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
              title="只分析根目录下的松散书签（速度快、API调用少）"
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
              title="分析所有书签（全面但较慢，API调用较多）"
            >
              <Search className="w-3 h-3" /> 深度
            </button>
          </div>

          {/* 书签栏保护开关 */}
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none" title="书签栏是高频区域，默认不参与整理">
            <input
              type="checkbox"
              checked={includeBookmarksBar}
              onChange={(e) => setIncludeBookmarksBar(e.target.checked)}
              className="rounded border-input"
            />
            包含书签栏
          </label>

          <Button onClick={handleStart} disabled={isRunning}>
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                分析中 {progress.done}/{progress.total}
              </>
            ) : (
              '开始整理'
            )}
          </Button>
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
            正在用 AI 逐条分析，请稍候... ({progress.done}/{progress.total})
          </p>
        </div>
      )}

      {/* 结果面板 */}
      {hasRun && !isRunning && (
        <div className="space-y-4">
          {/* 摘要 */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-muted/30 p-3 rounded">
            <div className="text-sm">
              已分析 <strong>{stats.total}</strong> 个书签
              {stats.needMove > 0 && (
                <span className="text-orange-600 font-medium ml-2">
                  ⚠ {stats.needMove} 个需要整理
                </span>
              )}
              {stats.correct > 0 && (
                <span className="text-green-600 ml-2">
                  ✅ {stats.correct} 个位置正确
                </span>
              )}
              {stats.total === 0 && (
                <span className="text-muted-foreground ml-2">未找到书签，请确认书签库非空</span>
              )}
            </div>
            {stats.needMove > 0 && (
              <Button size="sm" onClick={acceptAll}>
                全部接受 ({stats.needMove})
              </Button>
            )}
          </div>

          {/* 过滤 Tab */}
          {stats.total > 0 && (
            <div className="flex gap-1 p-1 bg-muted rounded-lg w-max">
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
              <button
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  filterTab === 'all' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                全部 ({stats.total})
              </button>
            </div>
          )}

          {/* 书签列表 */}
          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
            {filteredItems.length === 0 && stats.total > 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                {filterTab === 'move'
                  ? '🎉 太棒了！所有书签都在正确的位置，无需整理。'
                  : '当前过滤条件下没有结果'}
              </div>
            )}
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className={`border p-3 rounded transition-colors ${
                  item.result?.action === 'move'
                    ? 'border-orange-200 bg-orange-50/30 dark:border-orange-900/30 dark:bg-orange-950/10'
                    : 'border-green-200 bg-green-50/30 dark:border-green-900/30 dark:bg-green-950/10'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate text-sm" title={item.title}>
                      {item.title}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{item.url}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      📂 当前: <span className="font-medium">{item.currentPath}</span>
                    </p>

                    {item.result?.action === 'move' && (
                      <div className="bg-primary/5 p-2 mt-2 rounded text-sm border border-primary/10">
                        <div className="flex items-center gap-2 text-primary font-medium mb-1">
                          <ArrowRight className="h-4 w-4" />
                          建议移至: {item.result.suggestedFolderPath}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {item.result.reasoning} (置信度 {Math.round(item.result.confidence * 100)}%)
                        </p>
                      </div>
                    )}

                    {item.result?.action === 'keep' && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-green-600">
                        <Check className="h-3 w-3" /> 位置正确 — {item.result.reasoning}
                      </div>
                    )}
                  </div>

                  {item.result?.action === 'move' && (
                    <div className="shrink-0">
                      <Button size="sm" onClick={() => acceptSuggestion(item)}>
                        ✅ 接受
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 空状态 */}
      {!hasRun && !isRunning && (
        <div className="text-center py-8 text-sm text-muted-foreground">
          <FolderSearch className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>选择模式后点击「开始整理」</p>
          <p className="text-xs mt-2 max-w-md mx-auto">
            <strong>快速模式</strong>：只分析根目录下的松散书签（推荐首次使用）<br/>
            <strong>深度模式</strong>：审查所有书签的分类是否合理（API 调用较多）
          </p>
        </div>
      )}
    </div>
  );
}
