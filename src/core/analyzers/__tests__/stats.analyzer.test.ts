import { describe, it, expect } from 'vitest';
import { BookmarkAnalyzer } from '@/core/analyzers/stats.analyzer';
import { buildBookmarkTree, createBookmark, createFolder } from '@/tests/helpers/mock-bookmarks';

describe('BookmarkAnalyzer', () => {
  const analyzer = new BookmarkAnalyzer();

  it('空树应该全部返回零值', () => {
    const stats = analyzer.analyze([]);
    expect(stats.totalBookmarks).toBe(0);
    expect(stats.totalFolders).toBe(0);
    expect(stats.maxDepth).toBe(0);
    expect(stats.topDomains).toEqual([]);
    expect(stats.recentlyAdded).toBe(0);
  });

  it('应该正确统计书签和文件夹数量', () => {
    const tree = buildBookmarkTree(
      [
        createBookmark({ id: 'b1' }),
        createBookmark({ id: 'b2' }),
        createFolder({ id: 'f1', title: '我的文件夹' }, [
          createBookmark({ id: 'b3' }),
        ]),
      ]
    );

    const stats = analyzer.analyze(tree);
    expect(stats.totalBookmarks).toBe(3);
    // 文件夹包括：书签栏(1) + 其他书签(2) + 用户创建的文件夹 = 3
    expect(stats.totalFolders).toBe(3);
  });

  it('应该正确统计域名分布', () => {
    const tree = buildBookmarkTree([
      createBookmark({ url: 'https://github.com/repo1' }),
      createBookmark({ url: 'https://github.com/repo2' }),
      createBookmark({ url: 'https://www.google.com' }),
    ]);

    const stats = analyzer.analyze(tree);
    const githubDomain = stats.topDomains.find((d: { domain: string }) => d.domain === 'github.com');
    expect(githubDomain).toBeDefined();
    expect(githubDomain!.count).toBe(2);
  });

  it('应该统计近 30 天新增的书签', () => {
    const now = Date.now();
    const tree = buildBookmarkTree([
      createBookmark({ dateAdded: now - 1000 }),
      createBookmark({ dateAdded: now - 86400000 * 3 }),
      createBookmark({ dateAdded: now - 86400000 * 60 }),
    ]);

    const stats = analyzer.analyze(tree);
    expect(stats.recentlyAdded).toBe(2);
  });

  it('topDomains 最多返回 10 个', () => {
    const bookmarks = Array.from({ length: 15 }, (_, i) =>
      createBookmark({ url: `https://domain${i}.com/page` })
    );
    const tree = buildBookmarkTree(bookmarks);

    const stats = analyzer.analyze(tree);
    expect(stats.topDomains.length).toBeLessThanOrEqual(10);
  });

  it('应该正确计算树深度', () => {
    const tree = buildBookmarkTree([
      createFolder({}, [
        createFolder({}, [
          createBookmark({}),
        ]),
      ]),
    ]);

    const stats = analyzer.analyze(tree);
    expect(stats.maxDepth).toBeGreaterThanOrEqual(2);
  });
});
