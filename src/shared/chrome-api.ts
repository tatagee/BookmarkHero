/**
 * 获取完整的书签树
 * @returns 包含所有书签节点的数组
 */
export async function getBookmarkTree(): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  return new Promise((resolve, reject) => {
    if (!chrome.bookmarks) {
      // 在非扩展环境中运行的情况（例如本地 dev 服务器）
      return reject(new Error('chrome.bookmarks API is not available. Please run inside a Chrome Extension context.'));
    }
    chrome.bookmarks.getTree((tree) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(tree);
      }
    });
  });
}

/**
 * 根据 ID 获取特定书签
 * @param id 书签的唯一标识符
 */
export async function getBookmark(id: string): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.get(id, (results) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(results);
      }
    });
  });
}

/**
 * 递归搜索匹配特定内容的书签
 * @param query 搜索关键字
 */
export async function searchBookmarks(query: string): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.search(query, (results) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(results);
      }
    });
  });
}

/**
 * 创建书签或文件夹
 * @param bookmark 书签创建参数（如果没有 url 则创建文件夹）
 */
export async function createBookmark(
  bookmark: { parentId?: string; index?: number; title?: string; url?: string }
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.create(bookmark, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * 移动书签到新位置
 * @param id 需要移动的书签ID
 * @param destination 目标位置参数
 */
export async function moveBookmark(
  id: string,
  destination: { parentId?: string; index?: number }
): Promise<chrome.bookmarks.BookmarkTreeNode> {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.move(id, destination, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * 删除书签或空文件夹
 * @param id 要删除的书签ID
 */
export async function removeBookmark(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.remove(id, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * 删除整个文件夹及其包含的所有内容（高危操作）
 * @param id 要删除的文件夹ID
 */
export async function removeBookmarkTree(id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.bookmarks.removeTree(id, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve();
      }
    });
  });
}

/**
 * 确保指定的书签文件夹路径存在，如果不存在则自动创建，返回最终的 folderId
 * @param path 文件夹路径，例如 '书签栏/开发资源/前端'
 */
export async function ensureFolderExists(path: string): Promise<string> {
  const parts = path.split('/').filter(Boolean);

  if (parts.length > 10) {
    throw new Error(`[ensureFolderExists] Folder path too deep (${parts.length} levels). Maximum allowed is 10.`);
  }
  if (parts.some(p => p.length > 100)) {
    throw new Error('[ensureFolderExists] Folder name too long. Maximum allowed is 100 characters per folder.');
  }

  if (parts.length === 0) return '1'; // 如果传空，默认返回常理上的书签栏 ID

  const tree = await getBookmarkTree();
  // root 节点包含所有顶层（书签栏 1，其他书签 2等）
  
  let currentParentId = '1'; // 默认从书签栏开始找
  let currentNodes = tree[0]?.children || [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    // 如果是第一层级，且它是特定的根目录名字（通过匹配 id 为 1, 2, 3 的默认节点）
    if (i === 0) {
      const existingRoot = currentNodes.find(n => n.title === part || n.id === part);
      if (existingRoot) {
        currentParentId = existingRoot.id;
        currentNodes = existingRoot.children || [];
        continue;
      }
    }

    // 在当前级子节点中寻找同名的文件夹
    const existingObj = currentNodes.find(n => n.title === part && !n.url);
    if (existingObj) {
      currentParentId = existingObj.id;
      // 继续往下找之前，得确信我们有它的 children，因为如果是普通节点可能没有 children 字段，此时需要 getSubTree
      if (existingObj.children) {
         currentNodes = existingObj.children;
      } else {
         // chrome api getTree 查出来的是所有的，所以理论上一定有 children，如果没带，就去拿子树
         const subTree = await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve) => {
            chrome.bookmarks.getSubTree(existingObj.id, resolve);
         });
         currentNodes = subTree[0]?.children || [];
      }
    } else {
      // 没找到，创建这个层级
      const newFolder = await createBookmark({
        parentId: currentParentId,
        title: part
      });
      currentParentId = newFolder.id;
      currentNodes = []; // 新创建的一定是空的
    }
  }

  return currentParentId;
}
