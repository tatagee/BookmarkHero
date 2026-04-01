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
import { ConcurrencyQueue, chunkArray } from "../../core/utils/concurrency";
import { checkUrlsViaBackground } from "../../core/scanners/dead-link.scanner";
import { SCAN_CONFIG } from "../../shared/constants";
import { useT } from "../../i18n";

/** 一键清理子组件 — 内嵌在结果面板标题栏中 */
function BatchDeleteButton({
  scannerId,
  issues,
}: {
  scannerId: string;
  issues: ScanIssue[];
}) {
  const t = useT();
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
            description: scannerId === 'empty-folder-scanner'
              ? t('issueList.logDesc.folder', { title: issue.bookmarkTitle })
              : t('issueList.logDesc.bookmark', { title: issue.bookmarkTitle }),
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
          {t('scanner.batchCleanBtn', { count: issues.length })}
        </Button>
      )}

      {phase === 'confirming' && (
        <div className="flex items-center gap-2 animate-in fade-in duration-200">
          <span className="text-xs text-destructive font-medium whitespace-nowrap">
            {t('scanner.batchCleanConfirm', { count: issues.length })}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={() => setPhase('idle')}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-7 px-3 text-xs"
            onClick={handleBatchDelete}
          >
            {t('common.confirm')}
          </Button>
        </div>
      )}

      {phase === 'deleting' && (
        <div className="flex items-center gap-3 animate-in fade-in duration-200">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-destructive" />
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium">
              {t('scanner.batchCleanProgress', { done: progress.done, total: progress.total })}
              {progress.failed > 0 && <span className="text-yellow-600 ml-1">{t('scanner.batchCleanFailed', { failed: progress.failed })}</span>}
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
          {t('scanner.batchCleanDone')}
        </span>
      )}
    </div>
  );
}

/** 针对死链的二次检测按钮 */
function RecheckDeadLinksButton({
  scannerId,
  issues,
}: {
  scannerId: string;
  issues: ScanIssue[];
}) {
  const t = useT();
  const batchRemoveIssues = useScannerStore(state => state.batchRemoveIssues);
  const [phase, setPhase] = useState<'idle' | 'checking' | 'done'>('idle');
  const [progress, setProgress] = useState({ done: 0, total: 0, recovered: 0 });

  if (scannerId !== 'dead-link-scanner' || issues.length === 0) return null;

  const handleRecheck = async () => {
    setPhase('checking');
    const total = issues.length;
    setProgress({ done: 0, total, recovered: 0 });

    const queue = new ConcurrencyQueue(3);
    const BATCH_SIZE = 5;
    const batches = chunkArray(issues, BATCH_SIZE);
    
    let done = 0;
    let recovered = 0;
    const recoveredIds: string[] = [];

    const tasks = batches.map(batch => async () => {
      try {
        const urls = batch.map(b => ({ bookmarkId: b.bookmarkId, url: b.bookmarkUrl! }));
        // 使用针对书签体检稍长的超时时间进行复测
        const result = await checkUrlsViaBackground(urls, SCAN_CONFIG.HEAD_TIMEOUT_MS + 5000);
        
        for (const urlResult of result.results) {
          if (urlResult.alive) {
            recoveredIds.push(`deadlink-${urlResult.bookmarkId}`);
            recovered++;
          }
        }
      } catch (err) {
        console.error(`[Recheck] 二次检测批次失败:`, err);
      } finally {
        done += batch.length;
        setProgress({ done, total, recovered });
      }
    });

    await Promise.all(tasks.map((t) => queue.run(t)));

    if (recoveredIds.length > 0) {
      batchRemoveIssues(scannerId, recoveredIds);
    }

    setPhase('done');
    setTimeout(() => setPhase('idle'), 3000);
  };

  return (
    <div className="relative flex items-center mr-2">
      {phase === 'idle' && (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-600 text-muted-foreground transition-colors"
          onClick={handleRecheck}
        >
          <Play className="h-3 w-3" />
          {t('scanner.recheckBtn')}
        </Button>
      )}

      {phase === 'checking' && (
        <div className="flex items-center gap-2 animate-in fade-in duration-200">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-500" />
          <span className="text-xs font-medium">
            {t('scanner.recheckProgress', { done: progress.done, total: progress.total })}
          </span>
        </div>
      )}

      {phase === 'done' && (
        <span className="text-xs text-emerald-600 font-medium animate-in fade-in duration-200">
          {t('scanner.recheckDone', { recovered: progress.recovered })}
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
  const t = useT();

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
                  {t(scanner.name as any)}
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
                <CardDescription className="line-clamp-2 text-xs">{t(scanner.description as any)}</CardDescription>
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
                        <p>{t('scanner.card.foundIssues', { count: scannerResult.issues.length })}</p>
                        <p className="text-xs text-muted-foreground pt-1">
                           {t('scanner.card.timeSpent', {
                             time: (scannerResult.stats.duration / 1000).toFixed(1),
                             count: scannerResult.stats.totalScanned
                           })}
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
                          {isExpanded ? t('scanner.card.collapse') : t('scanner.card.expand')}
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
              <h3 className="text-sm font-semibold">{t('scanner.detail.title', { name: t(expandedScanner.name as any) })}</h3>
              <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {t('scanner.detail.count', { count: expandedResult.issues.length })}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* 二次检测复测按钮（仅死链体检显示） */}
              <RecheckDeadLinksButton
                scannerId={expandedScannerId}
                issues={expandedResult.issues}
              />
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
