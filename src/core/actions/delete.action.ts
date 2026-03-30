import type { IAction, ActionParams, UndoInfo } from './types';
import { getBookmark, removeBookmark, removeBookmarkTree, createBookmark } from '../../shared/chrome-api';

export class DeleteAction implements IAction {
  public id = 'delete.action';
  public name = '删除记录';

  /**
   * 执行删除
   * 我们会在删除前查询原节点信息以保存回滚数据
   */
  async execute(params: ActionParams): Promise<UndoInfo | null> {
    try {
      const nodes = await getBookmark(params.bookmarkId);
      if (!nodes || nodes.length === 0) return null;
      
      const node = nodes[0];
      
      const undoInfo: UndoInfo = {
        actionId: this.id,
        bookmarkId: node.id,
        previousState: {
          parentId: node.parentId,
          index: node.index,
          title: node.title,
          url: node.url
        }
      };

      // 判断是普通书签本身还是文件夹
      if (node.url) {
        await removeBookmark(node.id);
      } else {
        // 安全校验：只允许删除真正的空文件夹（即 children 数组为空或不存在）
        // 如果尝试删除一个有内容的文件夹，此删除不可逆！undo 无法恢复子树内容
        const hasChildren = node.children && node.children.length > 0;
        if (hasChildren) {
          throw new Error(
            `[DeleteAction] 拒绝删除有内容的文件夹 "${node.title}"\u3002` +
            `请确认文件夹為空后再操作。`
          );
        }
        await removeBookmarkTree(node.id);
      }

      return undoInfo;
    } catch (error) {
       console.error(`[DeleteAction] Failed to delete bookmark ${params.bookmarkId}:`, error);
       throw error;
    }
  }

  /**
   * 撤销删除（原路新建）
   */
  async undo(undoInfo: UndoInfo): Promise<void> {
    if (undoInfo.actionId !== this.id) {
       throw new Error('UndoInfo actionId mismatch');
    }
    
    try {
      // 通过保存的原始数据重新新建一个节点
      await createBookmark({
        parentId: undoInfo.previousState.parentId,
        index: undoInfo.previousState.index,
        title: undoInfo.previousState.title,
        url: undoInfo.previousState.url
      });
      // 注意：新建后的 ID 与原先旧的 ID 已经不同了，这在 Chrome API 逻辑里是正常的。
    } catch (error) {
      console.error(`[DeleteAction] Failed to undo deletion:`, error);
      throw error;
    }
  }
}
