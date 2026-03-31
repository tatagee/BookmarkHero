import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useScannerStore } from "../../stores/scanner.store";
import { useBookmarkStore } from "../../stores/bookmark.store";
import { useSettingsStore } from "../../stores/settings.store";
import { useLogStore } from "../../stores/log.store";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Progress } from "../ui/progress";
import { Play, Square, ChevronDown, X, Trash2, Loader2 } from "lucide-react";
import type { ScanOptions, ScanIssue } from "../../core/scanners";
import { IssueList } from "./IssueList";
import { DeleteAction } from "../../core/actions/delete.action";
import { ConcurrencyQueue } from "../../core/utils/concurrency";

/** 一键清理子组件 — 内嵌在结果面板标题栏中 */
function BatchDeleteButton({
  scannerId,
  issues,
}: {
  scannerId: string;
  issues: ScanIssue[];
}) {
  const batchRemoveIssues = useScannerStore(state => state.batchRemoveIssues);
  const addLog = useLogStore(state => state.addLog);
  const refreshBookmarks = useBookmarkStore(state => state.refreshBookmarks);

  const [phase, setPhase] = useState<'idle' | 'confirming' | 'deleting' | 'done'>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });

  const handleBatchDelete = async () => {
    setPhase('deleting');
    const total = issues.length;
    setProgress({ done: 0, total, failed: 0 });

    const queue = new ConcurrencyQueue(5);
    let done = 0;
    let failed = 0;
    const deletedIds: string[] = [];

    const tasks = issues.map((issue) => async () => {
      try {
        const action = new DeleteAction();
        const undoInfo = await action.execute({ bookmarkId: issue.bookmarkId });

        if (undoInfo) {
          // 记录日志，支持逐条撤销
          addLog({
            id: `log-batch-${Date.now()}-${issue.bookmarkId}`,
            actionId: action.id,
            description: `[批量清理] 删除了${scannerId === 'empty-folder-scanner' ? '文件夹' : '书签'}「${issue.bookmarkTitle}」`,
            undoInfo,
            bookmarkTitle: issue.bookmarkTitle,
            bookmarkUrl: issue.bookmarkUrl,
            folderPath: (issue.data as Record<string, unknown>)?.folderPath as string | undefined,
          });
        }
        deletedIds.push(issue.id);
      } catch (err) {
        console.error(`[BatchDelete] 删除 ${issue.bookmarkId} 失败:`, err);
        failed++;
      } finally {
        done++;
        setProgress({ done, total, failed });
      }
    });

    await Promise.all(tasks.map((t) => queue.run(t)));

    // 一次性从 store 中移除所有成功删除的 issue
    if (deletedIds.length > 0) {
      batchRemoveIssues(scannerId, deletedIds);
      refreshBookmarks();
    }

    setPhase('done');
    // 2 秒后自动复位
    setTimeout(() => setPhase('idle'), 2000);
  };

  if (issues.length === 0) return null;

  return (
    <div className="relative flex items-center">
      {phase === 'idle' && (
        <Button
          variant="destructive"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setPhase('confirming')}
        >
          <Trash2 className="h-3 w-3" />
          一键清理全部 ({issues.length})
        </Button>
      )}

      {phase === 'confirming' && (
        <div className="flex items-center gap-2 animate-in fade-in duration-200">
          <span className="text-xs text-destructive font-medium whitespace-nowrap">
            ⚠️ 确认清理全部 {issues.length} 项？
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => setPhase('idle')}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={handleBatchDelete}
          >
            确认清理
          </Button>
        </div>
      )}

      {phase === 'deleting' && (
        <div className="flex items-center gap-3 animate-in fade-in duration-200">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-destructive" />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium">
              已清理 {progress.done}/{progress.total}
              {progress.failed > 0 && <span className="text-yellow-600 ml-1">失败 {progress.failed}</span>}
            </span>
            <div className="w-32 bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-destructive h-1.5 rounded-full transition-all duration-200"
                style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <span className="text-xs text-emerald-600 font-medium animate-in fade-in duration-200">
          ✅ 清理完成！
        </span>
      )}
    </div>
  );
}

export function ScannerPanel() {
  const { scanners, isScanning, activeScannerId, progress, startScan, cancelScan, results } = useScannerStore(
    useShallow(state => ({
      scanners: state.scanners,
      isScanning: state.isScanning,
      activeScannerId: state.activeScannerId,
      progress: state.progress,
      startScan: state.startScan,
      cancelScan: state.cancelScan,
      results: state.results,
    }))
  );
  const tree = useBookmarkStore(state => state.tree);
  const { ignoreDomains, maxConcurrency } = useSettingsStore(
    useShallow(state => ({
      ignoreDomains: state.ignoreDomains,
      maxConcurrency: state.maxConcurrency,
    }))
  );

  // 当前展开查看详情的扫描器 ID
  const [expandedScannerId, setExpandedScannerId] = useState<string | null>(null);

  const buildScanOptions = (): ScanOptions => ({
    ignoreDomains,
    maxConcurrency,
  });

  const expandedResult = expandedScannerId ? results[expandedScannerId] : null;
  const expandedScanner = expandedScannerId ? scanners.find(s => s.id === expandedScannerId) : null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">体检工具集</h2>

      {/* 扫描器卡片网格 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {scanners.map((scanner) => {
          const isThisScanning = isScanning && activeScannerId === scanner.id;
          const scannerResult = results[scanner.id];
          const isExpanded = expandedScannerId === scanner.id;

          return (
            <Card
              key={scanner.id}
              className={`relative overflow-hidden group border-muted transition-all duration-200 ${
                isExpanded ? "ring-2 ring-primary/40 border-primary/30" : ""
              }`}
            >
              <CardHeader className="pb-3">
                <CardTitle className="flex justify-between items-center text-lg">
                  {scanner.name}
                  {isThisScanning ? (
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={cancelScan}>
                      <Square className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      disabled={isScanning}
                      onClick={() => startScan(scanner.id, tree, buildScanOptions())}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  )}
                </CardTitle>
                <CardDescription className="line-clamp-2 text-xs">{scanner.description}</CardDescription>
              </CardHeader>

              <CardContent>
                 {isThisScanning && progress && (
                   <div className="space-y-2 mt-2">
                     <Progress value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0} />
                     <p className="text-xs text-muted-foreground truncate animate-pulse">{String(progress.message ?? '')}</p>
                   </div>
                 )}

                 {!isThisScanning && scannerResult && (
                    <div className="mt-2">
                      <div className="text-sm bg-muted/50 p-2 rounded-md">
                        <p>发现了 <span className={scannerResult.issues.length > 0 ? "font-bold text-destructive" : "font-bold text-emerald-500"}>{scannerResult.issues.length}</span> 个问题</p>
                        <p className="text-xs text-muted-foreground pt-1">
                           耗时: {(scannerResult.stats.duration / 1000).toFixed(1)}s (已扫 {scannerResult.stats.totalScanned} 项)
                        </p>
                      </div>
                      {/* 展开/收起详情按钮 */}
                      {scannerResult.issues.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setExpandedScannerId(isExpanded ? null : scanner.id)}
                          className="w-full justify-center text-xs h-7 mt-2 hover:bg-primary/10"
                        >
                          {isExpanded ? "收起详情" : "查看问题详情"}
                          <ChevronDown className={`ml-1 h-3 w-3 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                        </Button>
                      )}
                    </div>
                 )}
              </CardContent>

              {/* 视觉提示侧边条 */}
              <div className={`absolute left-0 top-0 w-1 h-full ${
                 scannerResult ? (scannerResult.issues.length > 0 ? 'bg-destructive' : 'bg-emerald-500') : 'bg-transparent'
              }`} />
            </Card>
          );
        })}
      </div>

      {/* ====== 全宽结果详情面板 ====== */}
      {expandedScannerId && expandedResult && expandedScanner && expandedResult.issues.length > 0 && (
        <div className="border rounded-lg bg-card shadow-sm animate-in slide-in-from-top-2 duration-300">
          {/* 面板标题栏 */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{expandedScanner.name} — 问题详情</h3>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {expandedResult.issues.length} 项
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* 一键清理按钮 */}
              <BatchDeleteButton
                scannerId={expandedScannerId}
                issues={expandedResult.issues}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setExpandedScannerId(null)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {/* 全宽问题列表 */}
          <div className="p-4">
            <IssueList result={expandedResult} scannerId={expandedScannerId} />
          </div>
        </div>
      )}
    </div>
  );
}
