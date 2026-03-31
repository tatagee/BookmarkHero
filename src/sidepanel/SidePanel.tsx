import { useEffect } from 'react';
import { useBookmarkStore } from '../stores/bookmark.store';
import { useT } from '../i18n';
import { Button } from '../components/ui/button';
import { ScannerPanel } from '../components/dashboard/ScannerPanel';

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
            <div className="mt-8 text-center text-xs text-muted-foreground border-t pt-4">
               {t('app.statsFullLink')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
