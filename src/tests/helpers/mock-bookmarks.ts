/**
 * 书签树 Mock 数据工厂
 * 提供可复用的书签结构，供所有测试文件共享
 */

/** 创建一个书签节点 */
export function createBookmark(
  overrides: Partial<chrome.bookmarks.BookmarkTreeNode> = {}
): chrome.bookmarks.BookmarkTreeNode {
  return {
    id: overrides.id ?? `bm-${Math.random().toString(36).slice(2, 8)}`,
    title: overrides.title ?? 'Test Bookmark',
    url: overrides.url ?? 'https://example.com',
    parentId: overrides.parentId ?? '1',
    index: overrides.index ?? 0,
    dateAdded: overrides.dateAdded ?? Date.now(),
    ...overrides,
  };
}

/** 创建一个文件夹节点 */
export function createFolder(
  overrides: Partial<chrome.bookmarks.BookmarkTreeNode> = {},
  children: chrome.bookmarks.BookmarkTreeNode[] = []
): chrome.bookmarks.BookmarkTreeNode {
  return {
    id: overrides.id ?? `folder-${Math.random().toString(36).slice(2, 8)}`,
    title: overrides.title ?? 'Test Folder',
    parentId: overrides.parentId ?? '0',
    index: overrides.index ?? 0,
    dateAdded: overrides.dateAdded ?? Date.now(),
    dateGroupModified: overrides.dateGroupModified ?? Date.now(),
    children,
    ...overrides,
    // url 为 undefined 表示文件夹
    url: undefined,
  };
}

/**
 * 构建一棵最小完整的 Chrome 书签树
 * 结构：根(0) → 书签栏(1) → [内容...]
 *                其他书签(2) → [内容...]
 */
export function buildBookmarkTree(
  barChildren: chrome.bookmarks.BookmarkTreeNode[] = [],
  otherChildren: chrome.bookmarks.BookmarkTreeNode[] = []
): chrome.bookmarks.BookmarkTreeNode[] {
  return [
    {
      id: '0',
      title: '',
      children: [
        {
          id: '1',
          title: '书签栏',
          parentId: '0',
          children: barChildren,
        },
        {
          id: '2',
          title: '其他书签',
          parentId: '0',
          children: otherChildren,
        },
      ],
    },
  ];
}

/**
 * 构建一棵包含多种问题的测试书签树
 * 用于端到端的扫描器集成测试
 */
export function buildComplexTree(): chrome.bookmarks.BookmarkTreeNode[] {
  const emptyFolder = createFolder({ id: 'empty-1', title: '空文件夹' }, []);
  const nestedEmptyFolder = createFolder(
    { id: 'nested-empty-1', title: '看似有内容' },
    [
      createFolder({ id: 'nested-empty-2', title: '其实也是空的' }, []),
    ]
  );

  const dupBookmark1 = createBookmark({
    id: 'dup-1',
    title: 'Google',
    url: 'https://www.google.com/',
  });
  const dupBookmark2 = createBookmark({
    id: 'dup-2',
    title: 'Google搜索',
    url: 'https://google.com?utm_source=test',
  });

  const normalBookmark = createBookmark({
    id: 'normal-1',
    title: '正常书签',
    url: 'https://github.com',
  });

  const chromeBookmark = createBookmark({
    id: 'chrome-1',
    title: 'Chrome设置',
    url: 'chrome://settings',
  });

  return buildBookmarkTree(
    [normalBookmark, dupBookmark1, emptyFolder],
    [dupBookmark2, nestedEmptyFolder, chromeBookmark]
  );
}
