import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { STORAGE_KEYS } from '../shared/constants';
import type { OperationLog } from '../core/actions/types';
import { DeleteAction } from '../core/actions/delete.action';
import { MoveAction } from '../core/actions/move.action';

export interface LogState {
  logs: OperationLog[];
  
  /**
   * 添加一条新的操作日志
   */
  addLog: (log: Omit<OperationLog, 'status' | 'timestamp'>) => void;
  
  /**
   * 撤销某条日志记录（执行还原动作）
   */
  undoLog: (logId: string) => Promise<void>;
  
  /**
   * 清空所有日志
   */
  clearLogs: () => void;
}

// 最大保留条数
const MAX_LOGS = 100;

export const useLogStore = create<LogState>()(
  persist(
    (set, get) => ({
      logs: [],

      addLog: (partialLog) => {
        const newLog: OperationLog = {
          ...partialLog,
          timestamp: Date.now(),
          status: 'completed',
        };

        set((state) => {
          const freshLogs = [newLog, ...state.logs].slice(0, MAX_LOGS);
          return { logs: freshLogs };
        });
      },

      undoLog: async (logId: string) => {
        const state = get();
        const log = state.logs.find(l => l.id === logId);
        
        if (!log || log.status === 'undone') {
          return;
        }

        if (log.undoInfo) {
          try {
            // 目前只有 DeleteAction 支持 Undo
            if (log.actionId === 'delete.action') {
              const action = new DeleteAction();
              await action.undo(log.undoInfo);
            } else if (log.actionId === 'move.action') {
              const action = new MoveAction();
              await action.undo(log.undoInfo);
            } else {
              throw new Error(`Undo not implemented for action: ${log.actionId}`);
            }

            // 成功还原后更新状态
            set((state) => ({
              logs: state.logs.map(l => 
                l.id === logId ? { ...l, status: 'undone' } : l
              )
            }));
          } catch (error) {
            console.error('[LogStore] Undo failed:', error);
            throw error;
          }
        }
      },

      clearLogs: () => set({ logs: [] }),
    }),
    {
      name: STORAGE_KEYS.OPERATION_LOGS,
      storage: createJSONStorage(() => ({
        getItem: async (name) => {
          const result = await chrome.storage.local.get(name);
          return (result[name] as string) || null;
        },
        setItem: async (name, value) => {
          await chrome.storage.local.set({ [name]: value });
        },
        removeItem: async (name) => {
          await chrome.storage.local.remove(name);
        },
      })),
    }
  )
);
