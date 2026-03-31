import { describe, it, expect, vi } from 'vitest';
import { DuplicateScanner } from '@/core/scanners/duplicate.scanner';
import { buildBookmarkTree, createBookmark, createFolder } from '@/tests/helpers/mock-bookmarks';

describe('DuplicateScanner', () => {
  const scanner = new DuplicateScanner();

  it('应该检测到完全相同 URL 的重复书签', async () => {
    const tree = buildBookmarkTree([
      createBookmark({ id: 'a', title: 'Google', url: 'https://google.com' }),
      createBookmark({ id: 'b', title: 'Google搜索', url: 'https://google.com' }),
    ]);

    const result = await scanner.scan(tree);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].bookmarkId).toBe('b');
  });

  it('应该把 www 差异和尾部斜杠差异视为重复', async () => {
    const tree = buildBookmarkTree([
      createBookmark({ id: 'a', url: 'https://www.example.com/' }),
      createBookmark({ id: 'b', url: 'https://example.com' }),
    ]);

    const result = await scanner.scan(tree);
    expect(result.issues).toHaveLength(1);
  });

  it('应该把 UTM 参数差异视为重复', async () => {
    const tree = buildBookmarkTree([
      createBookmark({ id: 'a', url: 'https://example.com/page' }),
      createBookmark({ id: 'b', url: 'https://example.com/page?utm_source=twitter' }),
    ]);

    const result = await scanner.scan(tree);
    expect(result.issues).toHaveLength(1);
  });

  it('不应该把不同路径的 URL 视为重复', async () => {
    const tree = buildBookmarkTree([
      createBookmark({ id: 'a', url: 'https://example.com/page-a' }),
      createBookmark({ id: 'b', url: 'https://example.com/page-b' }),
    ]);

    const result = await scanner.scan(tree);
    expect(result.issues).toHaveLength(0);
  });

  it('3 个重复项应该产生 2 个 issue（第一个是原版）', async () => {
    const tree = buildBookmarkTree([
      createBookmark({ id: 'a', url: 'https://github.com' }),
      createBookmark({ id: 'b', url: 'https://github.com' }),
      createBookmark({ id: 'c', url: 'https://www.github.com/' }),
    ]);

    const result = await scanner.scan(tree);
    expect(result.issues).toHaveLength(2);
    const issueIds = result.issues.map(i => i.bookmarkId);
    expect(issueIds).not.toContain('a');
  });

  it('issue.data 应该包含文件夹路径信息', async () => {
    const tree = buildBookmarkTree(
      [createBookmark({ id: 'original', url: 'https://example.com' })],
      [createBookmark({ id: 'dupe', url: 'https://example.com' })]
    );

    const result = await scanner.scan(tree);
    expect(result.issues).toHaveLength(1);
    const data = result.issues[0].data as Record<string, unknown>;
    expect(data.folderPath).toBeDefined();
    expect(data.originalFolderPath).toBeDefined();
    expect(data.originalId).toBe('original');
  });

  it('没有书签时不应产生任何 issue', async () => {
    const tree = buildBookmarkTree([createFolder({ id: 'f1' })]);
    const result = await scanner.scan(tree);
    expect(result.issues).toHaveLength(0);
  });

  it('应该通过 onProgress 报告进度', async () => {
    const bookmarks = Array.from({ length: 200 }, (_, i: number) =>
      createBookmark({ id: `b-${i}`, url: `https://site${i}.com` })
    );
    const tree = buildBookmarkTree(bookmarks);
    const progressFn = vi.fn();

    await scanner.scan(tree, undefined, progressFn);
    expect(progressFn).toHaveBeenCalled();
  });
});
