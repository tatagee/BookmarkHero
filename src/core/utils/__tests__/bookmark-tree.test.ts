import { describe, it, expect } from 'vitest';
import { traverseBookmarkTree, flatBookmarks, getTreeDepth } from '@/core/utils/bookmark-tree';
import { buildBookmarkTree, createBookmark, createFolder } from '@/tests/helpers/mock-bookmarks';

describe('traverseBookmarkTree', () => {
  it('应该按顺序遍历所有节点', async () => {
    const visited: string[] = [];
    const tree = buildBookmarkTree([
      createBookmark({ id: 'b1', title: 'B1' }),
      createFolder({ id: 'f1', title: 'F1' }, [
        createBookmark({ id: 'b2', title: 'B2' }),
      ]),
    ]);

    await traverseBookmarkTree(tree, {
      onNode: (node: chrome.bookmarks.BookmarkTreeNode) => { visited.push(node.id); },
    });

    expect(visited).toContain('b1');
    expect(visited).toContain('f1');
    expect(visited).toContain('b2');
  });

  it('应该区分 onBookmark 和 onFolder 回调', async () => {
    const bookmarks: string[] = [];
    const folders: string[] = [];
    const tree = buildBookmarkTree([
      createBookmark({ id: 'bk1' }),
      createFolder({ id: 'fd1' }),
    ]);

    await traverseBookmarkTree(tree, {
      onBookmark: (node: chrome.bookmarks.BookmarkTreeNode) => { bookmarks.push(node.id); },
      onFolder: (node: chrome.bookmarks.BookmarkTreeNode) => { folders.push(node.id); },
    });

    expect(bookmarks).toContain('bk1');
    expect(folders).toContain('fd1');
    expect(folders).not.toContain('bk1');
  });

  it('应该传递正确的文件夹路径', async () => {
    const paths: Record<string, string[]> = {};
    const tree = buildBookmarkTree([
      createFolder({ id: 'f1', title: '工作' }, [
        createFolder({ id: 'f2', title: '项目A' }, [
          createBookmark({ id: 'deep', title: '深层书签' }),
        ]),
      ]),
    ]);

    await traverseBookmarkTree(tree, {
      onBookmark: (node: chrome.bookmarks.BookmarkTreeNode, path: string[]) => {
        paths[node.id] = path;
      },
    });

    expect(paths['deep']).toEqual(
      expect.arrayContaining(['工作', '项目A'])
    );
  });
});

describe('flatBookmarks', () => {
  it('应该只返回有 URL 的书签节点', () => {
    const tree = buildBookmarkTree([
      createBookmark({ id: 'b1' }),
      createFolder({ id: 'f1' }, [
        createBookmark({ id: 'b2' }),
      ]),
    ]);

    const flat = flatBookmarks(tree);
    expect(flat).toHaveLength(2);
    expect(flat.every((n: chrome.bookmarks.BookmarkTreeNode) => n.url)).toBe(true);
  });

  it('空树应该返回空数组', () => {
    expect(flatBookmarks([])).toEqual([]);
  });
});

describe('getTreeDepth', () => {
  it('空数组深度为 0', () => {
    expect(getTreeDepth([])).toBe(0);
  });

  it('只有叶子节点深度为 0', () => {
    expect(getTreeDepth([createBookmark()])).toBe(0);
  });

  it('嵌套文件夹应该正确计算深度', () => {
    const tree = [
      createFolder({}, [
        createFolder({}, [
          createFolder({}, [
            createBookmark({}), // 添加一个叶子节点确保 3 层
          ]),
        ]),
      ]),
    ];
    expect(getTreeDepth(tree)).toBe(3);
  });
});
