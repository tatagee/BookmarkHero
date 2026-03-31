import { useEffect } from 'react';
import { useBookmarkStore } from '../stores/bookmark.store';
import { useScannerStore } from '../stores/scanner.store';
import { StatsCards } from '../components/dashboard/StatsCards';
import { ScannerPanel } from '../components/dashboard/ScannerPanel';
import { OperationLogPanel } from '../components/dashboard/OperationLogPanel';
import { AIProviderSettings } from '../components/settings/AIProviderSettings';
import { AIClassifierPanel } from '../components/dashboard/AIClassifierPanel';
import { Button } from '../components/ui/button';
import { RefreshCw } from 'lucide-react';

export default function Options() {
  const refreshBookmarks = useBookmarkStore(state => state.refreshBookmarks);
  const isLoading = useBookmarkStore(state => state.isLoading);
  const scanners = useScannerStore(state => state.scanners);
  const clearResults = useScannerStore(state => state.clearResults);

  useEffect(() => {
    refreshBookmarks();
  }, [refreshBookmarks]);

  // 刷新书签数据时，同步清空所有旧的扫描结果
  // 因为书签已变更，之前的扫描结论不再可信
  const handleRefresh = () => {
    scanners.forEach(s => clearResults(s.id));
    refreshBookmarks();
  };

  return (
    <div className="min-h-screen bg-background text-foreground animate-in fade-in duration-500">
      <div className="max-w-6xl mx-auto p-8 space-y-8">
        {/* 页头 */}
        <div className="flex items-center justify-between mb-10 pb-4 border-b">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">BookmarkHero 控制台</h1>
            <p className="text-muted-foreground mt-1">你的数字记忆管家，随时保持书签库轻盈健康。</p>
          </div>
          <Button variant="outline" onClick={handleRefresh} disabled={isLoading} className="shadow-sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            重新获取数据
          </Button>
        </div>

        {/* 核心统计 */}
        <StatsCards />

        {/* 工具区 */}
        <div className="pt-4 space-y-8">
          <AIProviderSettings />
          <ScannerPanel />
          <AIClassifierPanel />
        </div>

        {/* 撤销日志区 */}
        <OperationLogPanel />
      </div>
    </div>
  );
}
