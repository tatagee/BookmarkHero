import { useState, useMemo, useRef, useEffect } from 'react';
import { useBookmarkStore } from '../../stores/bookmark.store';
import { ClassificationService } from '../../core/services/classification.service';
import { DuplicateFolderMerger } from '../../core/services/duplicate-folder-merger';
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

/** 递归遍历全树，收集所有书签（深度模式：包含全部书签） */
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

  const refreshBookmarks = useBookmarkStore((state) => state.refreshBookmarks);
  const maxConcurrency = useSettingsStore((state) => state.maxConcurrency);
  const addLog = useLogStore((state) => state.addLog);
  const t = useT();

  // === 核心：一键扫描 + AI 分析 ===
  const handleStart = async () => {
    // ── Pre-flight 同步校验（解决插件中 async 后 window.confirm 报错假死的问题） ──
    if (scanMode === 'deep') {
      const freshTree = useBookmarkStore.getState().tree;
      const allRootNodes = freshTree[0]?.children || [];
      const rootNodes = allRootNodes.filter((node) => {
        if (!includeBookmarksBar) {
          if (node.id === '1' || /^(Bookmarks bar|书签栏|Bookmarks Bar)$/i.test(node.title)) {
            return false;
          }
        }
        return true;
      });
      let preCollected = 0;
      for (const root of rootNodes) {
        preCollected += collectAllBookmarks(root.children || [], root.title).length;
      }
      
      if (preCollected > 0) {
        const estimatedTokens = preCollected * 575;
        let tokenStr = '';
        if (estimatedTokens < 1000) {
          tokenStr = estimatedTokens.toString();
        } else if (estimatedTokens < 1000000) {
          tokenStr = (estimatedTokens / 1000).toFixed(1) + 'K';
        } else {
          tokenStr = (estimatedTokens / 1000000).toFixed(2) + 'M';
        }
        
        const confirmed = window.confirm(t('ai.deep.warning', { count: preCollected, tokens: tokenStr }));
        if (!confirmed) {
          return; // 用户取消，直接中断
        }
      }
    }

    setIsRunning(true);
    setHasRun(true);
    setItems([]);
    setFilterTab('move');

    try {
      // ── Step 0: 合并重复文件夹（本地逻辑，不消耗 API） ──
      toast.info(t('ai.merge.running'));
      const merger = new DuplicateFolderMerger();
      const { result: mergeResult } = await merger.merge(includeBookmarksBar);

      if (mergeResult.mergedGroups > 0) {
        addLog({
          id: crypto.randomUUID(),
          actionId: 'merge.folder',
          description: t('ai.merge.done', { groups: mergeResult.mergedGroups, items: mergeResult.movedItems }),
        });
        toast.success(t('ai.merge.done', { groups: mergeResult.mergedGroups, items: mergeResult.movedItems }));
        // 刷新书签树以反映合并后的状态
        await refreshBookmarks();
      } else {
        toast.info(t('ai.merge.none'));
      }

      // ── Step 1: 重新收集书签（使用合并后的最新树） ──
      const freshTree = useBookmarkStore.getState().tree;
      const allRootNodes = freshTree[0]?.children || [];
      const rootNodes = allRootNodes.filter((node) => {
        if (!includeBookmarksBar) {
          if (node.id === '1' || /^(Bookmarks bar|书签栏|Bookmarks Bar)$/i.test(node.title)) {
            return false;
          }
        }
        return true;
      });
      let collected: BookmarkItem[];

      if (scanMode === 'quick') {
        // 快速模式：只收集根目录下的松散书签
        collected = collectRootBookmarks(rootNodes);
      } else {
        // 深度模式：收集全部书签
        const all: BookmarkItem[] = [];
        for (const root of rootNodes) {
          all.push(...collectAllBookmarks(root.children || [], root.title));
        }
        collected = all;
      }

      if (collected.length === 0) {
        toast.info('未能提取到任何书签。如果您的书签都在书签栏中，请勾选「包含书签栏」后再试。');
        setIsRunning(false);
        return;
      }

      // (预估 Token 警告已在 handleStart 顶部处理完毕)

      // ── Step 2: AI 逐条分析 ──
      setProgress({ done: 0, total: collected.length });

      const service = new ClassificationService();
      await service.preloadFolders();

      // === 核心：深度模式下，先进行大纲整体规划 ===
      if (scanMode === 'deep') {
        toast.info(t('ai.deep.blueprinting'));
        await service.generateTaxonomyBlueprint(collected.map(item => ({ title: item.title, url: item.url })));
        toast.success(t('ai.deep.blueprintingDone'));
      }

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
          }, { mode: scanMode, strictFoldersOnly: scanMode === 'deep' });
          results.push({ ...item, result: res });
        } catch (err) {
          console.error(`[AI整理] ${item.title} 分析失败:`, err);
        } finally {
          completed++;
          setProgress({ done: completed, total: collected.length });
        }
      });

      await Promise.all(tasks.map((t) => queue.run(t)));

      if (results.length === 0 && collected.length > 0) {
        toast.error('全部分析均失败，可能是 API 额度不足 (429) 或网络连接存在问题。详情请查看扩展程序的控制台日志。');
      }

      // 3. 按 move 优先排序结果
      results.sort((a, b) => {
        if (a.result?.action === 'move' && b.result?.action !== 'move') return -1;
        if (a.result?.action !== 'move' && b.result?.action === 'move') return 1;
        return (b.result?.confidence ?? 0) - (a.result?.confidence ?? 0);
      });

      setItems(results);
      queueRef.current = null;
    } catch (err) {
      console.error('[AIClassifierPanel] handleStart error:', err);
      toast.error(String(err));
    } finally {
      setIsRunning(false);
    }
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
      if (
        targetId === 'fallback_id_or_create_new' || 
        targetId === 'fallback' || 
        String(targetId).startsWith('virtual-')
      ) {
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
    if (moveItems.length === 0) return;

    // ── 阶段1：收集所有需要创建/查找的文件夹路径，按路径去重 ──
    const pathsNeedResolve = new Set<string>();
    for (const item of moveItems) {
      const fid = item.result!.suggestedFolderId;
      if (
        fid === 'fallback_id_or_create_new' || 
        fid === 'fallback' || 
        String(fid).startsWith('virtual-')
      ) {
        pathsNeedResolve.add(item.result!.suggestedFolderPath);
      }
    }

    // ── 阶段2：按顺序创建/查找文件夹，构建 path→folderId 映射 ──
    // 串行执行确保不会重复创建同名文件夹
    const resolvedFolderMap = new Map<string, string>();
    for (const path of pathsNeedResolve) {
      try {
        const folderId = await ensureFolderExists(path);
        resolvedFolderMap.set(path, folderId);
      } catch (err) {
        console.error(`[acceptAll] 创建文件夹失败: ${path}`, err);
        toast.error(t('ai.moveFailed', { err: `文件夹创建失败: ${path}` }));
      }
    }

    // ── 阶段3：使用预解析的文件夹 ID 批量移动书签 ──
    let movedCount = 0;
    for (const item of moveItems) {
      try {
        let targetId = item.result!.suggestedFolderId;
        if (
          targetId === 'fallback_id_or_create_new' || 
          targetId === 'fallback' || 
          String(targetId).startsWith('virtual-')
        ) {
          const resolved = resolvedFolderMap.get(item.result!.suggestedFolderPath);
          if (!resolved) {
            // 该路径的文件夹创建已在阶段2失败，跳过此书签
            continue;
          }
          targetId = resolved;
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
            description: t('ai.logDesc.move', { path: item.result!.suggestedFolderPath }),
            undoInfo,
            bookmarkTitle: item.title,
            bookmarkUrl: item.url,
            folderPath: item.currentPath,
          });
        }

        setItems((prev) => prev.filter((i) => i.id !== item.id));
        movedCount++;
      } catch (err) {
        console.error(`[acceptAll] 移动书签失败: ${item.title}`, err);
        toast.error(t('ai.moveFailed', { err: String(err) }));
      }
    }

    console.log(`[acceptAll] 完成：成功移动 ${movedCount}/${moveItems.length} 个书签`);
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
