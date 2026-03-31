import { useState } from 'react';
import { useLogStore } from "../../stores/log.store";
import { Button } from '../ui/button';
import { Clock, Trash2, Undo2, Loader2 } from "lucide-react";
import { useT } from "../../i18n";
import { useBookmarkStore } from '../../stores/bookmark.store';

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

  if (logs.length === 0) return null;

  const handleUndo = async (logId: string) => {
    setUndoingId(logId);
    try {
      await undoLog(logId);
      await refreshBookmarks();
    } catch (err) {
      alert(t('log.undoFailed', { err: String(err) }));
    } finally {
      setUndoingId(null);
    }
  };

  return (
    <div className="mt-12 space-y-4 animate-in fade-in duration-500">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          {t('log.title')}
        </h2>
        
        <Button variant="ghost" size="sm" onClick={clearLogs} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="w-4 h-4 mr-2" />
          {t('log.clearAll')}
        </Button>
      </div>

      <div className="border rounded-lg bg-card shadow-sm divide-y max-h-[400px] overflow-y-auto">
        {logs.map((log) => {
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
        })}
      </div>
    </div>
  );
}
