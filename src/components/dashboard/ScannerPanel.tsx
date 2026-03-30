import { useScannerStore } from "../../stores/scanner.store";
import { useBookmarkStore } from "../../stores/bookmark.store";
import { useSettingsStore } from "../../stores/settings.store";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Progress } from "../ui/progress";
import { Play, Square } from "lucide-react";
import type { ScanOptions } from "../../core/scanners";

export function ScannerPanel() {
  const { scanners, isScanning, activeScannerId, progress, startScan, cancelScan, results } = useScannerStore();
  const tree = useBookmarkStore(state => state.tree);
  // ✅ 修复：读取用户设置的规则，在启动扫描时传入
  const { ignoreDomains, maxConcurrency } = useSettingsStore(state => ({
    ignoreDomains: state.ignoreDomains,
    maxConcurrency: state.maxConcurrency,
  }));

  // 构建传给扫描器的 options，将用户的全局设置透传
  const buildScanOptions = (): ScanOptions => ({
    ignoreDomains,
    maxConcurrency,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">体检工具集</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {scanners.map((scanner) => {
          const isThisScanning = isScanning && activeScannerId === scanner.id;
          const scannerResult = results[scanner.id];

          return (
            <Card key={scanner.id} className="relative overflow-hidden group border-muted">
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
                      // ✅ 修复：传入用户设置的 options 参数
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
                     {/* ✅ 修复：progress.total 为 0 时不出现 NaN */}
                     <Progress value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0} />
                     <p className="text-xs text-muted-foreground truncate animate-pulse">{progress.message}</p>
                   </div>
                 )}

                 {!isThisScanning && scannerResult && (
                    <div className="mt-2 text-sm bg-muted/50 p-2 rounded-md">
                      <p>发现了 <span className={scannerResult.issues.length > 0 ? "font-bold text-destructive" : "font-bold text-emerald-500"}>{scannerResult.issues.length}</span> 个问题</p>
                      <p className="text-xs text-muted-foreground pt-1">
                         耗时: {(scannerResult.stats.duration / 1000).toFixed(1)}s (已扫 {scannerResult.stats.totalScanned} 项)
                      </p>
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
    </div>
  );
}
