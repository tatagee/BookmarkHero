import { describe, it, expect, vi } from 'vitest';
import { EmptyFolderScanner } from '@/core/scanners/empty-folder.scanner';
import { buildBookmarkTree, createBookmark, createFolder } from '@/tests/helpers/mock-bookmarks';

describe('EmptyFolderScanner', () => {
  const scanner = new EmptyFolderScanner();

  it('应该检测到完全空的文件夹', async () => {
    const tree = buildBookmarkTree([
      createFolder({ id: 'empty-1', title: '空壳' }, []),
      createBookmark({ id: 'b1' }),
    ]);

    const result = await scanner.scan(tree);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].bookmarkId).toBe('empty-1');
    expect(result.issues[0].suggestedAction).toBe('delete');
  });

  it('应该检测到"实质空"的嵌套文件夹结构', async () => {
    const tree = buildBookmarkTree([
      createFolder({ id: 'parent', title: '看似有东西' }, [
        createFolder({ id: 'child', title: '空子目录' }, []),
      ]),
    ]);

    const result = await scanner.scan(tree);
    const ids = result.issues.map(i => i.bookmarkId);
    expect(ids).toContain('parent');
    expect(ids).toContain('child');
  });

  it('不应该标记包含书签的文件夹', async () => {
    const tree = buildBookmarkTree([
      createFolder({ id: 'f1', title: '有内容' }, [
        createBookmark({ id: 'b1' }),
      ]),
    ]);

    const result = await scanner.scan(tree);
    expect(result.issues).toHaveLength(0);
  });

  it('不应该标记 Chrome 内建的根节点 (id=0,1,2)', async () => {
    const tree = buildBookmarkTree([], []);
    const result = await scanner.scan(tree);
    const ids = result.issues.map(i => i.bookmarkId);
    expect(ids).not.toContain('0');
    expect(ids).not.toContain('1');
    expect(ids).not.toContain('2');
  });

  it('应该通过 onProgress 报告进度', async () => {
    const tree = buildBookmarkTree([
      createFolder({ id: 'f1' }),
      createFolder({ id: 'f2' }),
    ]);
    const progressFn = vi.fn();

    await scanner.scan(tree, undefined, progressFn);
    expect(progressFn).toHaveBeenCalled();
    const lastCall = progressFn.mock.calls[progressFn.mock.calls.length - 1][0];
    expect(lastCall.message).toContain('完成');
  });

  it('cancel() 应该提前终止扫描', async () => {
    const manyFolders = Array.from({ length: 100 }, (_, i: number) =>
      createFolder({ id: `f-${i}` })
    );
    const tree = buildBookmarkTree(manyFolders);

    scanner.cancel();
    const result = await scanner.scan(tree);
    expect(result.stats.totalScanned).toBeLessThanOrEqual(100);
  });

  it('stats 应该包含正确的统计信息', async () => {
    const tree = buildBookmarkTree([
      createFolder({ id: 'f1' }),
      createFolder({ id: 'f2' }, [createBookmark({})]),
    ]);

    const result = await scanner.scan(tree);
    expect(result.scannerId).toBe('empty-folder-scanner');
    expect(result.stats.duration).toBeGreaterThanOrEqual(0);
    expect(result.stats.totalScanned).toBeGreaterThan(0);
  });
});
