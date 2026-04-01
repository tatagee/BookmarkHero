import { useEffect } from 'react';
import { useBookmarkStore } from '../stores/bookmark.store';
import { useScannerStore } from '../stores/scanner.store';
import { useSettingsStore, useSettingsActions } from '../stores/settings.store';
import { useT } from '../i18n';
import { StatsCards } from '../components/dashboard/StatsCards';
import { ScannerPanel } from '../components/dashboard/ScannerPanel';
import { OperationLogPanel } from '../components/dashboard/OperationLogPanel';
import { AIProviderSettings } from '../components/settings/AIProviderSettings';
import { AIClassifierPanel } from '../components/dashboard/AIClassifierPanel';
import { Button } from '../components/ui/button';
import { RefreshCw, Settings, Search, BarChart2, ChevronDown } from 'lucide-react';
import { Toaster } from 'sonner';

export default function Options() {
  const refreshBookmarks = useBookmarkStore(state => state.refreshBookmarks);
  const isLoading = useBookmarkStore(state => state.isLoading);
  const scanners = useScannerStore(state => state.scanners);
  const clearResults = useScannerStore(state => state.clearResults);
  const uiLanguage = useSettingsStore(state => state.uiLanguage);
  const actions = useSettingsActions();
  const t = useT();

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
      <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-6">
        {/* 页头 */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">{t('app.title')}</h1>
              <button
                onClick={() => actions.setUiLanguage(uiLanguage === 'zh' ? 'en' : 'zh')}
                className="text-xs font-medium px-2 py-0.5 rounded border bg-muted/30 hover:bg-muted text-muted-foreground transition-colors cursor-pointer"
                title={t('app.toggleLang')}
              >
                {t('app.langName')}
              </button>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{t('app.subtitle')}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading} className="shadow-sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </Button>
        </div>

        {/* 顶部总览和配置区 (默认折叠压缩空间) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          <details name="top-panels" className="group bg-card border rounded-lg shadow-sm [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex items-center justify-between p-4 font-medium cursor-pointer list-none hover:bg-muted/50 transition-colors">
              <span className="flex items-center gap-2"><BarChart2 className="w-5 h-5 text-primary" /> {t('section.overview')}</span>
              <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="p-4 border-t px-6 pb-6">
               <StatsCards />
            </div>
          </details>

          <details name="top-panels" className="group bg-card border rounded-lg shadow-sm [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex items-center justify-between p-4 font-medium cursor-pointer list-none hover:bg-muted/50 transition-colors">
              <span className="flex items-center gap-2"><Settings className="w-5 h-5 text-primary" /> {t('section.settings')}</span>
              <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="p-4 border-t px-6 pb-6">
               <AIProviderSettings />
            </div>
          </details>
        </div>

        {/* 旧版清理工具区 (默认折叠) */}
        <details className="group bg-card border rounded-lg shadow-sm [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex items-center justify-between p-4 font-medium cursor-pointer list-none hover:bg-muted/50 transition-colors">
            <span className="flex items-center gap-2"><Search className="w-5 h-5 text-primary" /> {t('section.scanners')}</span>
            <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="p-4 border-t pb-6">
             <ScannerPanel />
          </div>
        </details>

        {/* 主视线高亮区：AI分类面板 */}
        <div className="pt-2">
          <AIClassifierPanel />
        </div>

        {/* 撤销日志区 */}
        <OperationLogPanel />

        {/* 底部政策链接区 */}
        <div className="flex justify-center gap-4 py-8 text-sm text-muted-foreground">
          <a href="https://tatagee.github.io/BookmarkHero/privacy-policy.html" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors underline-offset-4 hover:underline">
            Privacy Policy
          </a>
          <span>&middot;</span>
          <a href="https://github.com/tatagee/BookmarkHero/blob/main/terms-of-service.md" target="_blank" rel="noopener noreferrer" className="hover:text-primary transition-colors underline-offset-4 hover:underline">
            Terms of Service
          </a>
        </div>
      </div>
      <Toaster position="bottom-right" richColors />
    </div>
  );
}
