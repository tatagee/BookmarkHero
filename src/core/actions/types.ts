export interface UndoInfo {
  actionId: string;
  bookmarkId: string;
  // 删除时用来恢复的原位置和其他元信息
  previousState: {
    parentId?: string;
    index?: number;
    title?: string;
    url?: string;
  };
  // 一次批量操作可能会有多个这样的恢复块
}

export interface ActionParams {
  bookmarkId: string;
  // 给特殊 action 留的参数
  payload?: Record<string, unknown>;
}

export interface IAction {
  id: string;
  name: string;
  execute(params: ActionParams): Promise<UndoInfo | null>;
  undo(undoInfo: UndoInfo): Promise<void>;
}

export interface OperationLog {
  id: string;               // 唯一日志 ID
  actionId: string;         // 'delete' | 'move' | 'merge'
  timestamp: number;
  description: string;      // "删除了书签 X"
  undoInfo?: UndoInfo;      // 可用于回滚的数据
  status: 'completed' | 'undone';
  
  // UI 展示补充信息
  bookmarkTitle?: string;
  bookmarkUrl?: string;
  folderPath?: string;
}
