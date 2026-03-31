import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useLogStore } from '../../stores/log.store';
import { useBookmarkStore } from '../../stores/bookmark.store';
import { Button } from '../ui/button';
import { Clock, RotateCcw, Trash2, CheckCircle2 } from 'lucide-react';

export function OperationLogPanel() {
  const { logs, clearLogs, undoLog } = useLogStore(
    useShallow((state) => ({
      logs: state.logs,
      clearLogs: state.clearLogs,
      undoLog: state.undoLog,
    }))
  );
  const refreshBookmarks = useBookmarkStore((state) => state.refreshBookmarks);
  const [undoingId, setUndoingId] = useState<string | null>(null);

  if (logs.length === 0) return null;

  const handleUndo = async (logId: string) => {
    setUndoingId(logId);
    try {
      await undoLog(logId);
      // 撤销后重新刷新全局书签树，以保证页面显示的最新
      await refreshBookmarks();
    } catch (err) {
      alert(`撤销失败: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUndoingId(null);
    }
  };

  return (
    <div className="mt-12 space-y-4 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          操作历史
        </h2>
        <Button variant="ghost" size="sm" onClick={clearLogs} className="text-xs text-muted-foreground">
          <Trash2 className="h-3.5 w-3.5 mr-1" /> 清空记录
        </Button>
      </div>

      <div className="border rounded-lg bg-card shadow-sm divide-y max-h-[400px] overflow-y-auto">
        {logs.map((log) => {
          const isUndone = log.status === 'undone';
          const isUndoing = undoingId === log.id;

          return (
            <div key={log.id} className={`flex items-start justify-between p-4 ${isUndone ? 'bg-muted/30 opacity-70' : ''}`}>
              <div className="space-y-1 overflow-hidden pr-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{log.description}</span>
                  {isUndone && (
                    <span className="flex items-center text-[10px] text-emerald-600 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                      <CheckCircle2 className="h-3 w-3 mr-0.5" /> 已撤销
                    </span>
                  )}
                </div>
                {/* 提取额外环境信息供展示 */}
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

              {!isUndone && log.undoInfo && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUndo(log.id)}
                  disabled={isUndoing}
                  className="shrink-0 h-8 text-xs"
                >
                  <RotateCcw className={`mr-1.5 h-3.5 w-3.5 ${isUndoing ? 'animate-spin' : ''}`} />
                  {isUndoing ? '撤销中...' : '撤销'}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
