/**
 * 遍历书签树的访问器接口
 */
export interface BookmarkVisitor {
  onNode?: (node: chrome.bookmarks.BookmarkTreeNode, path: string[]) => void | Promise<void>;
  onFolder?: (node: chrome.bookmarks.BookmarkTreeNode, path: string[]) => void | Promise<void>;
  onBookmark?: (node: chrome.bookmarks.BookmarkTreeNode, path: string[]) => void | Promise<void>;
}

/**
 * 异步遍历完整的 Chrome 书签树
 */
export async function traverseBookmarkTree(
  nodes: chrome.bookmarks.BookmarkTreeNode[],
  visitor: BookmarkVisitor,
  path: string[] = []
): Promise<void> {
  for (const node of nodes) {
    await visitor.onNode?.(node, path);

    if (node.url) {
      // 有 url 属性的是书签项
      await visitor.onBookmark?.(node, path);
    } else {
      // 没 url 及其代表是个文件夹 (夹具)
      await visitor.onFolder?.(node, path);
      
      // 继续遍历子节点
      if (node.children && node.children.length > 0) {
        const folderName = node.title || 'Untitled';
        await traverseBookmarkTree(node.children, visitor, [...path, folderName]);
      }
    }
  }
}

/**
 * 将整棵树展平为一维的书签数组（只保留书签，排除文件夹）
 */
export function flatBookmarks(trees: chrome.bookmarks.BookmarkTreeNode[]): chrome.bookmarks.BookmarkTreeNode[] {
  const result: chrome.bookmarks.BookmarkTreeNode[] = [];
  
  function traverse(nodes: chrome.bookmarks.BookmarkTreeNode[]) {
    for (const node of nodes) {
      if (node.url) {
        result.push(node);
      }
      if (node.children) {
        traverse(node.children);
      }
    }
  }
  
  traverse(trees);
  return result;
}

/**
 * 获取这棵树最大深度
 */
export function getTreeDepth(nodes: chrome.bookmarks.BookmarkTreeNode[]): number {
  if (!nodes || nodes.length === 0) return 0;
  
  let maxDepth = 0;
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      const childDepth = getTreeDepth(node.children);
      maxDepth = Math.max(maxDepth, childDepth + 1);
    }
  }
  return maxDepth;
}
