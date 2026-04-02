import { getBookmarkTree, moveBookmark, removeBookmark } from '../../shared/chrome-api';

/**
 * 合并结果统计
 */
export interface MergeResult {
  /** 合并的文件夹组数（每组有 ≥2 个同名文件夹） */
  mergedGroups: number;
  /** 被删除的重复文件夹总数 */
  removedFolders: number;
  /** 被迁移的书签/子文件夹总数 */
  movedItems: number;
}

/**
 * 用于 undo 的单次移动记录
 */
export interface FolderMergeUndoRecord {
  /** 被移动的节点 ID */
  nodeId: string;
  /** 移动前所在的父文件夹 ID */
  previousParentId: string;
  /** 移动前的位置索引 */
  previousIndex?: number;
}

/**
 * 重复文件夹合并器
 *
 * 检测同一父级下完全同名的文件夹，将内容合并到书签数最多的那个，
 * 然后删除被清空的重复文件夹。
 */
export class DuplicateFolderMerger {

  /**
   * 执行合并操作
   * @param includeBookmarksBar 是否包含书签栏
   * @returns 合并结果统计
   */
  async merge(includeBookmarksBar: boolean): Promise<{ result: MergeResult; undoRecords: FolderMergeUndoRecord[] }> {
    const tree = await getBookmarkTree();
    const rootChildren = tree[0]?.children || [];

    // 构造需要扫描的根节点列表（尊重"包含书签栏"开关）
    const targetRoots = rootChildren.filter((node) => {
      if (!includeBookmarksBar) {
        if (node.id === '1' || /^(Bookmarks bar|书签栏|Bookmarks Bar)$/i.test(node.title)) {
          return false;
        }
      }
      return true;
    });

    const stats: MergeResult = { mergedGroups: 0, removedFolders: 0, movedItems: 0 };
    const undoRecords: FolderMergeUndoRecord[] = [];

    // 递归处理所有层级的文件夹
    for (const root of targetRoots) {
      await this.processFolder(root, stats, undoRecords);
    }

    return { result: stats, undoRecords };
  }

  /**
   * 递归处理某个文件夹节点，检测其直接子文件夹中的同名项并合并
   */
  private async processFolder(
    parentNode: chrome.bookmarks.BookmarkTreeNode,
    stats: MergeResult,
    undoRecords: FolderMergeUndoRecord[]
  ): Promise<void> {
    const children = parentNode.children || [];

    // 1. 收集直接子文件夹（无 URL 的节点即为文件夹）
    const subFolders = children.filter(n => !n.url && n.children !== undefined);

    // 2. 按名称分组
    const nameGroups = new Map<string, chrome.bookmarks.BookmarkTreeNode[]>();
    for (const folder of subFolders) {
      const name = folder.title.trim();
      if (!name) continue; // 跳过无名文件夹
      const group = nameGroups.get(name) || [];
      group.push(folder);
      nameGroups.set(name, group);
    }

    // 3. 对每组重复文件夹执行合并
    for (const [, group] of nameGroups) {
      if (group.length < 2) continue;

      stats.mergedGroups++;

      // 选出书签数最多的作为保留目标
      const keepTarget = this.pickKeepTarget(group);
      const duplicates = group.filter(f => f.id !== keepTarget.id);

      for (const dupFolder of duplicates) {
        // 将 dupFolder 中的所有直接子节点移入 keepTarget
        const dupChildren = dupFolder.children || [];
        for (const child of dupChildren) {
          // 记录 undo 信息
          undoRecords.push({
            nodeId: child.id,
            previousParentId: dupFolder.id,
            previousIndex: child.index,
          });

          await moveBookmark(child.id, { parentId: keepTarget.id });
          stats.movedItems++;
        }

        // 删除已清空的重复文件夹
        try {
          await removeBookmark(dupFolder.id);
          stats.removedFolders++;
        } catch (err) {
          // 如果文件夹不是完全空的（嵌套子文件夹也移走后仍存在子节点），用 removeTree
          // 但理论上我们已经移走了所有子节点，这里做防御性处理
          console.warn(`[DuplicateFolderMerger] 删除文件夹 ${dupFolder.title}(${dupFolder.id}) 失败:`, err);
        }
      }
    }

    // 4. 递归处理子文件夹（用保留下来的文件夹继续向下检测）
    // 需要重新获取树，因为上面的操作可能已经改变了树结构
    if (stats.mergedGroups > 0 || subFolders.length > 0) {
      const freshTree = await getBookmarkTree();
      const freshParent = this.findNodeById(freshTree, parentNode.id);
      if (freshParent) {
        const freshSubFolders = (freshParent.children || []).filter(n => !n.url);
        for (const folder of freshSubFolders) {
          await this.processFolder(folder, stats, undoRecords);
        }
      }
    }
  }

  /**
   * 从一组同名文件夹中选出保留目标 = 递归统计书签数最多的那个
   */
  private pickKeepTarget(group: chrome.bookmarks.BookmarkTreeNode[]): chrome.bookmarks.BookmarkTreeNode {
    let best = group[0];
    let bestCount = this.countBookmarks(best);

    for (let i = 1; i < group.length; i++) {
      const count = this.countBookmarks(group[i]);
      if (count > bestCount) {
        best = group[i];
        bestCount = count;
      }
    }

    return best;
  }

  /**
   * 递归统计文件夹下的书签数量
   */
  private countBookmarks(node: chrome.bookmarks.BookmarkTreeNode): number {
    let count = 0;
    for (const child of node.children || []) {
      if (child.url) {
        count++;
      } else {
        count += this.countBookmarks(child);
      }
    }
    return count;
  }

  /**
   * 在书签树中按 ID 查找节点
   */
  private findNodeById(
    tree: chrome.bookmarks.BookmarkTreeNode[],
    id: string
  ): chrome.bookmarks.BookmarkTreeNode | null {
    for (const node of tree) {
      if (node.id === id) return node;
      if (node.children) {
        const found = this.findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  }
}
