import { useEffect, useState } from 'react';
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
import { RefreshCw, BarChart2, Search, Settings, ChevronDown } from 'lucide-react';
import { Toaster } from 'sonner';

type TabId = 'overview' | 'scanners' | 'settings';

/** Tab 定义 */
const TAB_DEFS: { id: TabId; icon: typeof BarChart2; labelKey: string }[] = [
  { id: 'overview',  icon: BarChart2, labelKey: 'section.overview' },
  { id: 'scanners',  icon: Search,    labelKey: 'section.scanners' },
  { id: 'settings',  icon: Settings,  labelKey: 'section.settings' },
];

export default function Options() {
  const refreshBookmarks = useBookmarkStore(state => state.refreshBookmarks);
  const isLoading = useBookmarkStore(state => state.isLoading);
  const scanners = useScannerStore(state => state.scanners);
  const clearResults = useScannerStore(state => state.clearResults);
  const uiLanguage = useSettingsStore(state => state.uiLanguage);

  // 互斥 Tab 状态：null = 全部收起
  const [activeTab, setActiveTab] = useState<TabId | null>(null);

  const toggleTab = (tab: TabId) => {
    setActiveTab(prev => (prev === tab ? null : tab));
  };

  const actions = useSettingsActions();
  const t = useT();

  useEffect(() => {
    refreshBookmarks();
  }, [refreshBookmarks]);

  // 刷新书签数据时，同步清空所有旧的扫描结果
  const handleRefresh = () => {
    scanners.forEach(s => clearResults(s.id));
    refreshBookmarks();
  };

  return (
    <div className="min-h-screen bg-background text-foreground animate-in fade-in duration-500">
      <div className="max-w-6xl mx-auto p-4 sm:p-8 space-y-6">
        {/* 页头 */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b">
          <div className="flex items-center gap-4">
            <img 
              src="/concept-logo.png" 
              alt="BookmarkHero" 
              className="w-12 h-12 rounded-lg shadow-sm object-cover"
            />
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
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isLoading} className="shadow-sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </Button>
        </div>

        {/* ======= 三合一 Tab 栏 + 共享内容区 ======= */}
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          {/* Tab 按钮行 */}
          <div className="flex border-b">
            {TAB_DEFS.map(({ id, icon: Icon, labelKey }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  onClick={() => toggleTab(id)}
                  className={`
                    flex-1 flex items-center justify-center gap-2 px-4 py-3
                    text-sm font-medium cursor-pointer transition-colors
                    ${isActive
                      ? 'bg-primary/5 text-primary border-b-2 border-primary -mb-px'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                    }
                  `}
                >
                  <Icon className="w-4 h-4" />
                  {t(labelKey as any)}
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 opacity-70 ${isActive ? 'rotate-180' : ''}`} />
                </button>
              );
            })}
          </div>

          {/* 共享内容区 */}
          {activeTab && (
            <div className="p-4 sm:p-6 animate-in fade-in slide-in-from-top-1 duration-200">
              {activeTab === 'overview' && <StatsCards />}
              {activeTab === 'scanners' && <ScannerPanel />}
              {activeTab === 'settings' && <AIProviderSettings />}
            </div>
          )}
        </div>

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
