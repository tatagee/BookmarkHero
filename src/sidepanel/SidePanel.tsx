import { useEffect } from 'react';
import { useBookmarkStore } from '../stores/bookmark.store';
import { useT } from '../i18n';
import { Button } from '../components/ui/button';
import { ScannerPanel } from '../components/dashboard/ScannerPanel';
import { Sparkles, ArrowRight } from 'lucide-react';
import { Toaster } from 'sonner';

export default function SidePanel() {
  const t = useT();
  const refreshBookmarks = useBookmarkStore(state => state.refreshBookmarks);
  const isLoading = useBookmarkStore(state => state.isLoading);
  const error = useBookmarkStore(state => state.error);
  const stats = useBookmarkStore(state => state.stats);

  useEffect(() => {
    refreshBookmarks();
  }, [refreshBookmarks]);

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-card">
        <h1 className="text-lg font-bold flex items-center gap-2">
          <span className="text-2xl drop-shadow-sm">🦸</span> {t('sidepanel.title')}
        </h1>
        <Button variant="outline" size="sm" onClick={openOptions} className="shadow-sm">
          {t('sidepanel.btnBigScreen')}
        </Button>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {isLoading ? (
          <div className="flex justify-center items-center h-32">
            <div className="text-muted-foreground animate-pulse text-sm">{t('app.loadingBookmarks')}</div>
          </div>
        ) : error ? (
          <div className="text-destructive text-sm bg-destructive/10 p-4 rounded-lg flex items-start gap-2 border border-destructive/20">
            <span className="text-lg">⚠️</span>
            <p>{error}</p>
          </div>
        ) : (
          <div className="animate-in fade-in duration-500">
            {/* 顶栏迷你看板 */}
            <div className="group flex justify-around p-3 mb-6 bg-muted/30 border rounded-lg text-sm text-center">
              <div>
                 <p className="text-muted-foreground text-xs mb-1">{t('sidepanel.miniStats.total')}</p>
                 <p className="font-semibold text-primary">{stats?.totalBookmarks || 0}</p>
              </div>
              <div className="w-px bg-border/50 hidden md:block"></div>
              <div>
                 <p className="text-muted-foreground text-xs mb-1">{t('sidepanel.miniStats.folders')}</p>
                 <p className="font-semibold text-primary">{stats?.totalFolders || 0}</p>
              </div>
            </div>

            <ScannerPanel />

            {/* AI 功能引流卡片 */}
            <div className="mt-6 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/20 rounded-xl p-5 shadow-sm text-left relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Sparkles className="w-16 h-16 text-indigo-500" />
              </div>
              <h3 className="font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-2 mb-2 relative z-10">
                {t('sidepanel.ai.title')}
              </h3>
              <p className="text-xs text-muted-foreground mb-4 leading-relaxed relative z-10">
                {t('sidepanel.ai.desc')}
              </p>
              <Button 
                onClick={openOptions} 
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white relative z-10 shadow-md group-hover:shadow-lg transition-all flex items-center justify-center gap-2"
              >
                {t('sidepanel.ai.btn')} <ArrowRight className="w-4 h-4" />
              </Button>
            </div>

            <div className="mt-8 text-center text-xs text-muted-foreground border-t pt-4">
               {t('app.statsFullLink')}
            </div>
          </div>
        )}
      </div>
      <Toaster position="top-center" richColors />
    </div>
  );
}
