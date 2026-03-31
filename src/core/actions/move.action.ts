import { moveBookmark, getBookmark } from '../../shared/chrome-api';
import type { IAction, ActionParams, UndoInfo } from './types';

export class MoveAction implements IAction {
  id = 'move.action';
  name = '移动书签';

  async execute(params: ActionParams): Promise<UndoInfo | null> {
    const { bookmarkId, payload } = params;
    
    if (!payload?.parentId) {
      throw new Error('[MoveAction] payload.parentId is required');
    }

    const currentResult = await getBookmark(bookmarkId);
    const current = currentResult?.[0];
    if (!current) return null;

    const targetId = payload.parentId as string;

    // 先拿到旧状态
    const previousState = {
      parentId: current.parentId,
      index: current.index,
    };

    // 执行移动
    await moveBookmark(bookmarkId, { parentId: targetId });

    return {
      actionId: this.id,
      bookmarkId,
      previousState
    };
  }

  async undo(undoInfo: UndoInfo): Promise<void> {
    if (!undoInfo.previousState.parentId) return;
    try {
      await moveBookmark(undoInfo.bookmarkId, {
        parentId: undoInfo.previousState.parentId,
        index: undoInfo.previousState.index
      });
    } catch (e) {
      console.error('[MoveAction] Undo failed', e);
      throw e;
    }
  }
}
