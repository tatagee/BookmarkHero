import { useState } from 'react';
import { useLogStore } from "../../stores/log.store";
import { Button } from '../ui/button';
import { Clock, Trash2, Undo2, Loader2, ChevronDown } from "lucide-react";
import { useT } from "../../i18n";
import { useBookmarkStore } from '../../stores/bookmark.store';
import { toast } from 'sonner';

export function OperationLogPanel() {
  const logs = useLogStore((state) => state.logs);
  const clearLogs = useLogStore((state) => state.clearLogs);
  const undoLog = useLogStore((state) => state.undoLog);
  const refreshBookmarks = useBookmarkStore((state) => state.refreshBookmarks);
  const t = useT();
  const [undoingId, setUndoingId] = useState<string | null>(null);

  const getLocalizedDescription = (desc: string) => {
    // Bookmark delete
    let m = desc.match(/^\[清理\] 删除了书签「(.*)」$/) || desc.match(/^\[Clean\] Deleted bookmark "(.*)"$/);
    if (m) return t('issueList.logDesc.bookmark', { title: m[1] });

    // Folder delete
    m = desc.match(/^\[清理\] 删除了文件夹「(.*)」$/) || desc.match(/^\[Clean\] Deleted folder "(.*)"$/);
    if (m) return t('issueList.logDesc.folder', { title: m[1] });

    // Move
    m = desc.match(/^将书签移动至 "(.*)"$/) || desc.match(/^Moved bookmark to "(.*)"$/);
    if (m) return t('ai.logDesc.move', { path: m[1] });

    // Default fallback
    return desc;
  };

  const handleUndo = async (logId: string) => {
    setUndoingId(logId);
    try {
      await undoLog(logId);
      await refreshBookmarks();
    } catch (err) {
      toast.error(t('log.undoFailed', { err: String(err) }));
    } finally {
      setUndoingId(null);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      <details className="group bg-card border rounded-lg shadow-sm [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex items-center justify-between p-4 font-medium cursor-pointer list-none hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" />
            {t('log.title')}
            {logs.length > 0 && (
              <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{logs.length}</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {logs.length > 0 && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={(e) => { e.preventDefault(); clearLogs(); }} 
                className="text-muted-foreground hover:text-destructive h-7"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t('log.clearAll')}
              </Button>
            )}
            <ChevronDown className="w-5 h-5 text-muted-foreground transition-transform group-open:rotate-180" />
          </div>
        </summary>

        <div className="border-t divide-y max-h-[400px] overflow-y-auto">
          {logs.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {t('log.empty', { defaultValue: '暂无操作历史 / No operation history' })}
            </div>
          ) : (
            logs.map((log) => {
              const isUndone = log.status === 'undone';
              const isUndoing = undoingId === log.id;

              return (
                <div key={log.id} className={`flex items-center justify-between p-4 ${isUndone ? 'bg-muted/30 opacity-70' : ''}`}>
                  <div className="space-y-1 overflow-hidden pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{getLocalizedDescription(log.description)}</span>
                    </div>
                    {log.folderPath && (
                      <p className="text-xs text-muted-foreground truncate" title={log.folderPath}>
                        📁 {log.folderPath}
                      </p>
                    )}
                    {log.bookmarkUrl && (
                      <p className="text-xs text-muted-foreground truncate" title={log.bookmarkUrl}>
                        🔗 {log.bookmarkUrl}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60">
                      {new Date(log.timestamp).toLocaleString()}
                    </p>
                  </div>

                  {isUndone ? (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                      {t('log.undoneMark')}
                    </span>
                  ) : (
                    log.undoInfo && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUndo(log.id)}
                        disabled={isUndoing}
                        className="text-xs h-7"
                      >
                        {isUndoing ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <Undo2 className="w-3 h-3 mr-1" />
                            {t('log.btnUndo')}
                          </>
                        )}
                      </Button>
                    )
                  )}
                </div>
              );
            })
          )}
        </div>
      </details>
    </div>
  );
}
